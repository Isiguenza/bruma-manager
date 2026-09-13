import SwiftUI
import UIKit
import Combine

/// Puts the screen into a low-power "rest" mode (screen brightness near zero +
/// a dark screensaver) after a period of no touches, then instantly restores on
/// the next touch. Lets the iPad stay on "never auto-lock" (no unlock friction
/// for staff) while still saving battery — the backlight is the biggest drain.
@MainActor
final class IdleMonitor: ObservableObject {
    @Published private(set) var isSleeping = false

    /// Seconds of no interaction before dimming.
    var timeout: TimeInterval = 300

    /// When false (e.g. the customer-facing display), the screen never rests.
    var isEnabled = true {
        didSet { if !isEnabled && isSleeping { wake() } }
    }

    private var lastTouch = Date()
    private var timer: Timer?
    // No confiar en UIScreen.main.brightness tal cual si está sospechosamente
    // bajo: en un iPad de kiosko (una sola app corriendo, nada más resetea el
    // brillo del sistema) matar/relanzar la app mientras la pantalla ya
    // estaba atenuada hace que el siguiente arranque lea el brillo ya en ~0,
    // y ese valor quedaría "congelado" como objetivo de restauración para
    // siempre — wake() restauraría fielmente a ese 0.
    private var savedBrightness: CGFloat = IdleMonitor.sanitize(UIScreen.main.brightness)

    private static func sanitize(_ brightness: CGFloat) -> CGFloat {
        brightness > 0.15 ? brightness : 1.0
    }

    func start() {
        timer?.invalidate()
        // Coarse polling (every 20s) is plenty and costs almost nothing.
        timer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    /// Called on every touch anywhere in the app (via TouchMonitorView).
    func registerActivity() {
        lastTouch = Date()
        if isSleeping { wake() }
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            // Coming back to the foreground always wakes and resets the timer.
            registerActivity()
        case .inactive, .background:
            // Never leave the *system* brightness dimmed for other apps / the
            // home screen if we get backgrounded while resting.
            if isSleeping { UIScreen.main.brightness = IdleMonitor.sanitize(savedBrightness) }
        @unknown default:
            break
        }
    }

    private func tick() {
        guard isEnabled, !isSleeping else { return }
        if Date().timeIntervalSince(lastTouch) >= timeout {
            sleep()
        }
    }

    private func sleep() {
        savedBrightness = IdleMonitor.sanitize(UIScreen.main.brightness)
        UIScreen.main.brightness = 0.0
        withAnimation(.easeInOut(duration: 0.6)) { isSleeping = true }
    }

    private func wake() {
        UIScreen.main.brightness = IdleMonitor.sanitize(savedBrightness)
        lastTouch = Date()
        withAnimation(.easeInOut(duration: 0.3)) { isSleeping = false }
    }
}

// MARK: - App-wide touch detection

/// A gesture that observes every touch-began without ever recognizing (so it
/// never swallows or delays touches), used to detect activity app-wide.
private final class TouchObservingGesture: UIGestureRecognizer {
    var onTouch: (() -> Void)?
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        onTouch?()
        state = .failed
    }
}

private final class TouchAttachView: UIView {
    var onTouch: (() -> Void)?
    private var attached = false

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard !attached, let window else { return }
        let gesture = TouchObservingGesture()
        gesture.onTouch = { [weak self] in self?.onTouch?() }
        gesture.cancelsTouchesInView = false
        gesture.delaysTouchesBegan = false
        gesture.delaysTouchesEnded = false
        window.addGestureRecognizer(gesture)
        attached = true
    }
}

/// Transparent helper that attaches a window-level touch observer.
struct TouchMonitorView: UIViewRepresentable {
    let onTouch: () -> Void
    func makeUIView(context: Context) -> UIView {
        let view = TouchAttachView()
        view.onTouch = onTouch
        view.isUserInteractionEnabled = false // don't intercept, just observe via the window gesture
        return view
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: - Screensaver

/// Dark "rest" overlay shown while the screen is dimmed: a big clock + the Bruma
/// wordmark. Tapping anywhere wakes the screen.
struct ScreensaverView: View {
    @State private var now = Date()
    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 18) {
                Image("LogoBruma")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 44)
                    .opacity(0.6)

                Text(now, style: .time)
                    .font(.system(size: 68, weight: .thin, design: .rounded))
                    .foregroundColor(.white.opacity(0.75))
                    .contentTransition(.numericText())

                Text("Toca la pantalla para continuar")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.3))
                    .padding(.top, 8)
            }
        }
        .contentShape(Rectangle())
        .onReceive(clock) { now = $0 }
    }
}

// MARK: - View modifier

extension View {
    /// Wraps the view with the idle screen-rest behavior.
    func idleScreenRest(_ monitor: IdleMonitor, enabled: Bool) -> some View {
        modifier(IdleScreenRestModifier(monitor: monitor, enabled: enabled))
    }
}

private struct IdleScreenRestModifier: ViewModifier {
    @ObservedObject var monitor: IdleMonitor
    let enabled: Bool
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .background(TouchMonitorView { monitor.registerActivity() })
            .overlay {
                if monitor.isSleeping {
                    ScreensaverView()
                        .onTapGesture { monitor.registerActivity() }
                        .transition(.opacity)
                        .zIndex(999)
                }
            }
            .onAppear { monitor.start() }
            .onChange(of: enabled) { _, newValue in monitor.isEnabled = newValue }
            .onChange(of: scenePhase) { _, phase in monitor.handleScenePhase(phase) }
    }
}
