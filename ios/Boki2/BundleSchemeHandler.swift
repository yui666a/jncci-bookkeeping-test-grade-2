import Foundation
import UniformTypeIdentifiers
import WebKit

/// アプリに同梱した教材を `boki://app/...` で配信する。
///
/// `loadFileURL` で `file://` として開かない。review.html と practice.html は
/// XHR で assets/drills.json を読むが、`file://` のページからの XHR は WebKit が拒む。
/// 独自スキームなら通常の配信と同じく読めて、localStorage のオリジンも
/// `boki://app` に固定される。
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "boki"

    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }

        var file = root.appendingPathComponent(url.path).standardizedFileURL
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), isDirectory.boolValue {
            file.appendPathComponent("index.html")
        }

        // `..` で www/ の外へ出るパスは同梱ファイルでも返さない。
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            respond(task, url: url, status: 404, type: "text/plain; charset=utf-8", data: Data())
            return
        }
        respond(task, url: url, status: 200, type: mimeType(of: file), data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": type, "Content-Length": String(data.count)]
        )!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func mimeType(of file: URL) -> String {
        let type = UTType(filenameExtension: file.pathExtension)
        let mime = type?.preferredMIMEType ?? "application/octet-stream"
        return type?.conforms(to: .text) == true ? "\(mime); charset=utf-8" : mime
    }
}
