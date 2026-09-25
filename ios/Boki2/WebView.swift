import SafariServices
import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let start: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let www = Bundle.main.url(forResource: "www", withExtension: nil)!
        config.setURLSchemeHandler(BundleSchemeHandler(root: www), forURLScheme: BundleSchemeHandler.scheme)

        let content = config.userContentController
        content.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "clipboard")
        content.addUserScript(WKUserScript(source: Self.clipboardShim, injectionTime: .atDocumentStart, forMainFrameOnly: false))

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        webView.load(URLRequest(url: start))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    /// progress.html のエクスポートは `navigator.clipboard.writeText` を使う。
    /// WebKit の実装に任せない。独自スキームのページが安全なコンテキストと
    /// 見なされるかは WebKit の版に依存し、コピーできないと学習記録を持ち出せない。
    private static let clipboardShim = """
    (function () {
      function writeText(text) {
        return window.webkit.messageHandlers.clipboard.postMessage(String(text));
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText = writeText;
      } else {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeText }, configurable: true });
      }
    })();
    """

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
        // MARK: 外部リンク

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url, ![BundleSchemeHandler.scheme, "about"].contains(url.scheme ?? "") else {
                decisionHandler(.allow)
                return
            }
            // 公式サイトなどをアプリ内の WebView で開かない。教材へ戻る手段が
            // 戻るスワイプだけになり、どこにいるのか分からなくなる。
            decisionHandler(.cancel)
            openExternally(url, from: webView)
        }

        /// `target="_blank"` のリンク。新しい WebView は作らない。
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url {
                if url.scheme == BundleSchemeHandler.scheme {
                    webView.load(action.request)
                } else {
                    openExternally(url, from: webView)
                }
            }
            return nil
        }

        private func openExternally(_ url: URL, from webView: WKWebView) {
            if ["http", "https"].contains(url.scheme ?? ""), let presenter = webView.presenter {
                presenter.present(SFSafariViewController(url: url), animated: true)
            } else {
                UIApplication.shared.open(url)
            }
        }

        // MARK: alert / confirm
        // WKWebView は UI デリゲートが実装しない限り alert と confirm を黙って
        // 無視する。progress.html の全消去は confirm で確認を取る。

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            guard let presenter = webView.presenter else { return completionHandler() }
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "キャンセル", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            guard let presenter = webView.presenter else { return completionHandler(false) }
            presenter.present(alert, animated: true)
        }

        // MARK: クリップボード

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping (Any?, String?) -> Void
        ) {
            guard let text = message.body as? String else {
                replyHandler(nil, "text is not a string")
                return
            }
            UIPasteboard.general.string = text
            replyHandler(nil, nil)
        }
    }
}

private extension UIView {
    /// モーダルを重ねて出せる最前面のビューコントローラ。
    var presenter: UIViewController? {
        var top = window?.rootViewController
        while let next = top?.presentedViewController {
            top = next
        }
        return top
    }
}
