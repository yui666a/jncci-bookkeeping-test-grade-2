import SwiftUI

@main
struct Boki2App: App {
    var body: some Scene {
        WindowGroup {
            WebView(start: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!)
                .ignoresSafeArea(edges: .bottom)
        }
    }
}
