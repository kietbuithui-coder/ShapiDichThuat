import Foundation
import AVFoundation
import AVKit
import Capacitor

/**
 * Native iOS Bridge for SHAPI FLOW (iOS 16+)
 * Respects iOS App Sandbox honestly:
 * - Does NOT claim system-wide arbitrary overlay drawing over third-party apps.
 * - Provides AVPictureInPictureController capability check, low-latency AVAudioSession microphone config,
 *   and App Group Share Sheet media/subtitle import.
 */
@objc(LinguaFlowPlugin)
public class LinguaFlowPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LinguaFlowPlugin"
    public let jsName = "LinguaFlowNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureMicrophoneSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseAudioSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeSharedInboxItem", returnType: CAPPluginReturnPromise)
    ]

    @objc func checkCapabilities(_ call: CAPPluginCall) {
        let micStatus = AVAudioSession.sharedInstance().recordPermission
        let pipSupported = AVPictureInPictureController.isPictureInPictureSupported()

        call.resolve([
            "os": "ios",
            "hasMicrophonePermission": micStatus == .granted,
            "hasOverlayPermission": false,
            "supportsPlaybackCapture": false,
            "supportsFloatingOverlay": false,
            "supportsPictureInPicture": pipSupported,
            "supportsShareSheetImport": true
        ])
    }

    @objc func configureMicrophoneSession(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
            )
            try session.setActive(true)
            call.resolve(["active": true])
        } catch {
            call.reject("Không thể khởi tạo nguồn Micro trên iOS: \(error.localizedDescription)")
        }
    }

    @objc func releaseAudioSession(_ call: CAPPluginCall) {
        // Strictly stop microphone session when translation ends (Rule 14)
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        call.resolve(["released": true])
    }

    @objc func consumeSharedInboxItem(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: "group.com.linguaflow.shared")
        guard let sharedPath = defaults?.string(forKey: "pendingSharedFilePath") else {
            call.resolve(["hasItem": false])
            return
        }
        defaults?.removeObject(forKey: "pendingSharedFilePath")
        call.resolve([
            "hasItem": true,
            "filePath": sharedPath
        ])
    }
}
