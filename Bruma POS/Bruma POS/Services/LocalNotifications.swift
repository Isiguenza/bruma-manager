import Foundation
import UIKit
import UserNotifications

extension Notification.Name {
    /// Algo (tap en una notificación local, vuelta del background) indica que
    /// hay que re-consultar si quedó un pedido en línea sin atender.
    /// POSViewModel la observa.
    static let reconcilePendingOnlineOrders = Notification.Name("reconcilePendingOnlineOrders")
}

/// Notificaciones LOCALES (agendadas por la propia app, sin servidor) para
/// avisar que hay un pedido en línea pendiente — respaldo por si el iPad está
/// con la app en segundo plano cuando cae el pedido y no se ve la pantalla
/// verde. Cuando la app está al frente, la pantalla verde + el sonido en loop
/// siguen siendo la señal principal.
@MainActor
final class LocalNotificationManager {
    static let shared = LocalNotificationManager()
    private init() {}

    private let immediateId = "online-pending"
    private let repeatId = "online-pending-repeat"

    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error { print("⚠️ [LocalNotif] auth error: \(error)") }
            print("🔔 [LocalNotif] permiso: \(granted)")
        }
    }

    /// Agenda (o re-agenda) el aviso de pedido pendiente: uno inmediato + uno
    /// que se repite cada 2 min hasta que se atienda. Llamar cada vez que se
    /// detecta / re-detecta un pedido en línea sin atender.
    func schedulePendingOnlineOrder(orderNumber: Int, customerName: String?) {
        let center = UNUserNotificationCenter.current()

        let content = UNMutableNotificationContent()
        content.title = "🟢 Pedido en línea pendiente"
        content.body = "#\(orderNumber) — \(customerName ?? "Cliente"). Ábrelo para aceptarlo o rechazarlo."
        content.sound = .default

        center.add(UNNotificationRequest(identifier: immediateId, content: content, trigger: nil))

        let repeatContent = UNMutableNotificationContent()
        repeatContent.title = "⏰ Pedido en línea sin atender"
        repeatContent.body = "#\(orderNumber) sigue pendiente. Ábrelo para aceptarlo o rechazarlo."
        repeatContent.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 120, repeats: true)
        center.add(UNNotificationRequest(identifier: repeatId, content: repeatContent, trigger: trigger))
    }

    /// El pedido ya se atendió (o ya no hay pendientes) → quitar los avisos.
    func clearPendingOnlineOrder() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [immediateId, repeatId])
        center.removeDeliveredNotifications(withIdentifiers: [immediateId, repeatId])
    }
}

/// Solo para poder mostrar notificaciones locales con la app al frente y
/// reaccionar al tap. No hay push remoto — no se registra `registerForRemoteNotifications`.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in LocalNotificationManager.shared.requestAuthorization() }
        return true
    }

    /// Notificación local mientras la app está al frente — mostrarla igual.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        NotificationCenter.default.post(name: .reconcilePendingOnlineOrders, object: nil)
        completionHandler([.banner, .sound, .list])
    }

    /// El staff tocó la notificación → traer la pantalla verde de inmediato.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NotificationCenter.default.post(name: .reconcilePendingOnlineOrders, object: nil)
        completionHandler()
    }
}
