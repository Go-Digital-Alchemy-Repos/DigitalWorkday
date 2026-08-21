import AppKit
import XCTest
@testable import DigitalWorkday

final class DesktopModelTests: XCTestCase {
func testTimerAddsRunningInterval() {
    let now = Date(timeIntervalSince1970: 1_000)
    let timer = DWTimer(id: "timer", taskId: nil, projectId: nil, clientId: nil, title: nil, description: nil,
                        status: "running", elapsedSeconds: 30, lastStartedAt: now.addingTimeInterval(-90),
                        createdAt: now, updatedAt: now)
    XCTAssertEqual(timer.elapsed(at: now), 120)
}

func testGroupsUndatedPersonalTaskWithoutLosingIt() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let task = DWTask(id: "task", title: "Personal", description: nil, status: "todo", priority: "medium",
                      dueDate: nil, isPersonal: true, projectId: nil, projectName: nil, clientId: nil, clientName: nil,
                      sectionId: nil, assigneeIds: [], assignees: nil, estimateMinutes: nil,
                      subtasks: [], createdAt: now, updatedAt: now)
    let grouped = TaskGrouping.grouped([task], now: now)
    XCTAssertEqual(grouped.flatMap(\.1).map(\.id), ["task"])
    XCTAssertEqual(grouped.map(\.0), [.personal])
}

func testDurationFormatting() { XCTAssertEqual(DurationFormatter.short(3_661), "1:01:01") }

func testTaskSortingAndCompletedGrouping() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let open = DWTask(id: "open", title: "Open", description: nil, status: "todo", priority: "medium",
                      dueDate: now, isPersonal: true, projectId: nil, projectName: nil, clientId: nil, clientName: nil,
                      sectionId: nil, assigneeIds: [], assignees: nil, estimateMinutes: nil,
                      subtasks: [], createdAt: now, updatedAt: now)
    let done = DWTask(id: "done", title: "Done", description: nil, status: "done", priority: "high",
                      dueDate: now, isPersonal: true, projectId: nil, projectName: nil, clientId: nil, clientName: nil,
                      sectionId: nil, assigneeIds: [], assignees: nil, estimateMinutes: nil,
                      subtasks: [], createdAt: now, updatedAt: now)
    let grouped = TaskGrouping.grouped([open, done], now: now)
    XCTAssertEqual(grouped.first(where: { $0.0 == .completed })?.1.map(\.id), ["done"])
    XCTAssertEqual(TaskGrouping.sorted([open, done], by: .priority).first?.id, "done")
    XCTAssertEqual(TaskSelection.preferredID(current: done.id, prioritized: [done.id], visibleTasks: [open]), open.id)
    XCTAssertNil(TaskSelection.preferredID(current: done.id, prioritized: [done.id], visibleTasks: []))
}

func testOptimisticLockTimestampPreservesMilliseconds() throws {
    let source = "2026-08-20T13:46:54.123Z"
    let data = Data("\"\(source)\"".utf8)
    let decoded = try JSONCoding.decoder.decode(Date.self, from: data)

    XCTAssertEqual(JSONCoding.iso8601String(from: decoded), source)
}

@MainActor func testTipTapRichTextRendersAndRoundTripsFormatting() {
    let value = #"{"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"First item","marks":[{"type":"bold"}]}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Second item"}]}]}]}]}"#
    let attributed = TipTapRichText.attributedString(from: value)
    XCTAssertEqual(attributed.string, "• First item\n• Second item")
    let encoded = TipTapRichText.json(from: attributed)
    XCTAssertTrue(encoded.contains("bulletList"))
    XCTAssertTrue(encoded.contains("bold"))
}

func testPlainDescriptionIsUnchanged() {
    XCTAssertEqual(RichTextPlainText.displayText(from: "A normal description"), "A normal description")
}

func testUserDisplayNameAndInitialsPreferStructuredNames() {
    let user = DWUser(id: "1", name: "Old Name", firstName: "Alex", lastName: "Rivera", email: "alex@example.com", role: "employee", avatarUrl: nil)
    XCTAssertEqual(user.displayName, "Alex Rivera")
    XCTAssertEqual(user.initials, "AR")
}

func testAvatarURLResolutionSupportsRelativeAndAbsoluteValues() {
    XCTAssertEqual(APIClient.resolvedAvatarURL("/uploads/avatar.png")?.absoluteString, "https://digitalworkday.ai/uploads/avatar.png")
    XCTAssertEqual(
        APIClient.resolvedAvatarURL("https://pub-deadbeef.r2.dev/tenants/tenant-a/users/user-a/avatar/photo.png")?.absoluteString,
        "https://digitalworkday.ai/api/v1/files/serve/tenants/tenant-a/users/user-a/avatar/photo.png"
    )
    XCTAssertEqual(
        APIClient.resolvedAvatarURL("tenants/tenant-a/users/user-a/avatar/photo.png")?.absoluteString,
        "https://digitalworkday.ai/api/v1/files/serve/tenants/tenant-a/users/user-a/avatar/photo.png"
    )
    XCTAssertNil(APIClient.resolvedAvatarURL(nil))
}

func testAvatarRequestsNeverSendBearerAcrossOrigins() throws {
    let baseURL = try XCTUnwrap(URL(string: "https://api.example.com"))
    let sameOrigin = try XCTUnwrap(APIClient.avatarRequest(
        for: "https://api.example.com:443/uploads/avatar.png", baseURL: baseURL, accessToken: "desktop-secret"
    ))
    XCTAssertEqual(sameOrigin.value(forHTTPHeaderField: "Authorization"), "Bearer desktop-secret")

    for externalValue in [
        "https://cdn.example.com/avatar.png",
        "https://api.example.com.evil.test/avatar.png",
        "https://api.example.com:444/avatar.png",
        "http://api.example.com/avatar.png",
        "//cdn.example.com/avatar.png",
    ] {
        let request = try XCTUnwrap(APIClient.avatarRequest(
            for: externalValue, baseURL: baseURL, accessToken: "desktop-secret"
        ))
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"), externalValue)
    }

    XCTAssertNil(APIClient.avatarRequest(for: "file:///tmp/avatar.png", baseURL: baseURL,
                                         accessToken: "desktop-secret"))
}

func testInvalidAppearanceFallsBackToSystem() {
    let mode = AppearanceMode(rawValue: "unexpected") ?? .system
    XCTAssertEqual(mode, .system)
    XCTAssertNil(mode.colorScheme)
}

func testAdditiveDesktopTaskFieldsDecode() throws {
    let data = Data(#"{"id":"task","title":"Plan","description":null,"status":"todo","priority":"high","dueDate":null,"isPersonal":false,"projectId":"p","projectName":"Launch","clientId":"c","clientName":"Acme","sectionId":null,"assigneeIds":["u"],"assignees":[{"id":"u","name":"Alex","email":"alex@example.com","role":"employee","avatarUrl":null}],"estimateMinutes":90,"subtasks":[],"createdAt":"2026-08-19T12:00:00Z","updatedAt":"2026-08-19T12:00:00Z"}"#.utf8)
    let task = try JSONCoding.decoder.decode(DWTask.self, from: data)
    XCTAssertEqual(task.assignees?.first?.displayName, "Alex")
    XCTAssertEqual(task.estimateMinutes, 90)
}

func testLegacyTaskDetailWithoutTimeEntriesStillDecodes() throws {
    let data = Data(#"{"task":{"id":"task","title":"Plan","description":null,"status":"todo","priority":"medium","dueDate":null,"isPersonal":true,"projectId":null,"projectName":null,"clientId":null,"clientName":null,"sectionId":null,"assigneeIds":[],"assignees":[],"estimateMinutes":null,"subtasks":[],"createdAt":"2026-08-19T12:00:00Z","updatedAt":"2026-08-19T12:00:00Z"},"comments":[]}"#.utf8)
    let detail = try JSONCoding.decoder.decode(DWTaskDetail.self, from: data)
    XCTAssertEqual(detail.task.id, "task")
    XCTAssertTrue(detail.timeEntries.isEmpty)
}

func testTaskDetailIdentityChangesAcrossSelectionAndRefresh() {
    let updatedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let first = TaskDetailViewIdentity(taskID: "task-a", updatedAt: updatedAt)

    XCTAssertNotEqual(first, TaskDetailViewIdentity(taskID: "task-b", updatedAt: updatedAt))
    XCTAssertNotEqual(first, TaskDetailViewIdentity(taskID: "task-a", updatedAt: updatedAt.addingTimeInterval(1)))
    XCTAssertEqual(first, TaskDetailViewIdentity(taskID: "task-a", updatedAt: updatedAt))
}
}
