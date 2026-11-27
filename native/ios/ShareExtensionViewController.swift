import UIKit
import UniformTypeIdentifiers

/**
 * iOS Share Extension Receiver
 * Allows users to share a video file (.mp4/.mov) or subtitle file (.srt/.vtt) directly from Safari/Files/Photos
 * into SHAPI FLOW without requesting full Photo Library access.
 */
final class ShareExtensionViewController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        handleIncomingItems()
    }

    private func handleIncomingItems() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            completeRequest()
            return
        }

        let supportedTypes: [UTType] = [.mpeg4Movie, .quickTimeMovie, .plainText, .url]
        for provider in attachments {
            for type in supportedTypes where provider.hasItemConformingToTypeIdentifier(type.identifier) {
                provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { [weak self] item, _ in
                    if let url = item as? URL,
                       let containerURL = FileManager.default.containerURL(
                           forSecurityApplicationGroupIdentifier: "group.com.linguaflow.shared"
                       ) {
                        let destURL = containerURL.appendingPathComponent(url.lastPathComponent)
                        try? FileManager.default.removeItem(at: destURL)
                        if (try? FileManager.default.copyItem(at: url, to: destURL)) != nil {
                            let defaults = UserDefaults(suiteName: "group.com.linguaflow.shared")
                            defaults?.set(destURL.path, forKey: "pendingSharedFilePath")
                        }
                    }
                    DispatchQueue.main.async {
                        self?.completeRequest()
                    }
                }
                return
            }
        }
        completeRequest()
    }

    private func completeRequest() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
