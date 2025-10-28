import UIKit
import Capacitor
import AVFAudio
import MediaPlayer

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?
  private var volumeObserver: NSKeyValueObservation?
  private var volView: MPVolumeView?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

    // Crear ventana/bridge de Capacitor
    self.window = UIWindow(frame: UIScreen.main.bounds)
    let bridge = CAPBridgeViewController()
    self.window?.rootViewController = bridge
    self.window?.makeKeyAndVisible()

    // Habilitar sesión de audio para leer outputVolume (modo "ambient" no interrumpe otras apps)
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.ambient, options: [.mixWithOthers])
    try? session.setActive(true)

    // Agregar MPVolumeView oculto para suprimir el HUD de volumen
    let vv = MPVolumeView(frame: .zero)
    vv.isHidden = true
    self.window?.rootViewController?.view.addSubview(vv)
    self.volView = vv

    // Observar cambios de volumen
    self.volumeObserver = session.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
      guard let self = self else { return }
      DispatchQueue.main.async {
        // Dispara un evento DOM en la WebView
        if let bridgeVC = self.window?.rootViewController as? CAPBridgeViewController {
          let js = "window.dispatchEvent(new CustomEvent('volume-trigger'))"
          bridgeVC.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
      }
    }

    return true
  }

  func applicationWillTerminate(_ application: UIApplication) {
    self.cleanup()
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    // Mantener la sesión activa no es imprescindible; si querés, la reactivamos al volver
  }

  func applicationWillEnterForeground(_ application: UIApplication) {
    try? AVAudioSession.sharedInstance().setActive(true)
  }

  private func cleanup() {
    if let obs = self.volumeObserver {
      obs.invalidate()
      self.volumeObserver = nil
    }
    self.volView?.removeFromSuperview()
    self.volView = nil
  }
}
