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
                          sectionId: nil, assigneeIds: [], subtasks: [], createdAt: now, updatedAt: now)
        let grouped = TaskGrouping.grouped([task], now: now)
        XCTAssertEqual(grouped.flatMap(\.1).map(\.id), ["task"])
        XCTAssertEqual(grouped.map(\.0), [.personal])
    }

    func testDurationFormatting() { XCTAssertEqual(DurationFormatter.short(3_661), "1:01:01") }
}
