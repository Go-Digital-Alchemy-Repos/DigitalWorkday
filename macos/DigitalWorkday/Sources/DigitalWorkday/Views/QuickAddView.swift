import SwiftUI

struct QuickAddView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var projectID = "personal"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Quick Add").font(.title2.bold())
            TextField("What needs to be done?", text: $title).textFieldStyle(.roundedBorder)
            Picker("Context", selection: $projectID) {
                Text("Personal").tag("personal")
                ForEach(store.bootstrap?.projects ?? []) { project in
                    Text(project.clientName.map { "\($0) · \(project.name)" } ?? project.name).tag(project.id)
                }
            }
            HStack { Spacer(); Button("Cancel") { dismiss() }; Button("Create") {
                Task { await store.createTask(title: title, projectID: projectID == "personal" ? nil : projectID); dismiss() }
            }.buttonStyle(.borderedProminent).disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.connectivity.isOnline) }
        }.padding(20).frame(width: 380)
    }
}
