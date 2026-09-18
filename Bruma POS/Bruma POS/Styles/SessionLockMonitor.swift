import SwiftUI
import UIKit
import Combine

/// Re-bloqueo automático por inactividad — separado de `IdleMonitor`
/// (`IdleDimmer.swift`, que solo atenúa la pantalla y es exclusivo de POS).
/// Este mecanismo aplica a POS Y Mobile: si nadie toca la pantalla por
/// `timeout` segundos mientras hay un empleado logueado, se bloquea con un
/// overlay de PIN — sin navegar ni perder la mesa/carrito en progreso — para
/// que los reportes de Caja puedan confiar en que las acciones (comandar,
/// cobrar) están atribuidas a quien de verdad las hizo, no a quien dejó la
/// sesión abierta hace horas. Cualquier PIN de empleado válido desbloquea
/// (no tiene que ser el mismo que estaba activo), y ese empleado queda como
/// operador actual.
@MainActor
final class SessionLockMonitor: ObservableObject {
    @Published private(set) var isLocked = false

    /// Segundos de inactividad antes de re-bloquear.
    var timeout: TimeInterval = 180

    /// Solo tiene sentido bloquear si hay una sesión activa — lo evalúa el
    /// caller (normalmente `vm.employeeId != nil`) para no acoplar este
    /// archivo al tipo concreto de `POSViewModel`.
    var shouldLock: () -> Bool = { false }

    private var lastTouch = Date()
    private var timer: Timer?

    func start() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func registerActivity() {
        lastTouch = Date()
    }

    func unlock() {
        lastTouch = Date()
        withAnimation(.easeInOut(duration: 0.25)) { isLocked = false }
    }

    /// Bloqueo inmediato, sin esperar `timeout` — para cuando la app pasa a
    /// segundo plano (el usuario se fue al Home del iPad/iPhone). Así, al
    /// volver a abrir la app, ya está esperando el PIN en vez de dejar
    /// seguir usándola tal cual se dejó.
    func lockNow() {
        guard shouldLock() else { return }
        isLocked = true
    }

    private func tick() {
        guard !isLocked, shouldLock() else { return }
        if Date().timeIntervalSince(lastTouch) >= timeout {
            withAnimation(.easeInOut(duration: 0.25)) { isLocked = true }
        }
    }
}

// MARK: - App-wide touch detection
//
// Copia mínima (a propósito) de la técnica de `IdleDimmer.swift` — ese
// archivo es solo-POS conceptualmente (dimming de pantalla) y este mecanismo
// es compartido, así que se duplica el helper de detección de toques en vez
// de acoplar los dos features.

private final class LockTouchObservingGesture: UIGestureRecognizer {
    var onTouch: (() -> Void)?
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        onTouch?()
        state = .failed
    }
}

private final class LockTouchAttachView: UIView {
    var onTouch: (() -> Void)?
    private var attached = false

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard !attached, let window else { return }
        let gesture = LockTouchObservingGesture()
        gesture.onTouch = { [weak self] in self?.onTouch?() }
        gesture.cancelsTouchesInView = false
        gesture.delaysTouchesBegan = false
        gesture.delaysTouchesEnded = false
        window.addGestureRecognizer(gesture)
        attached = true
    }
}

private struct LockTouchMonitorView: UIViewRepresentable {
    let onTouch: () -> Void
    func makeUIView(context: Context) -> UIView {
        let view = LockTouchAttachView()
        view.onTouch = onTouch
        view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: - Overlay de re-lock

/// Pantalla de PIN a pantalla completa que cubre el contenido actual sin
/// reemplazarlo — a diferencia del login, no navega ni limpia carrito/mesa.
struct PinRelockOverlay: View {
    @ObservedObject var vm: POSViewModel
    let monitor: SessionLockMonitor

    @State private var pinInput = ""
    @State private var error = ""
    @State private var verifying = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.97).ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 40))
                    .foregroundColor(.white.opacity(0.6))

                Text("Sesión bloqueada por inactividad")
                    .font(.title3.bold())
                    .foregroundColor(.white)

                Text("Ingresa tu PIN para continuar")
                    .font(.subheadline)
                    .foregroundColor(.gray)

                HStack(spacing: 16) {
                    ForEach(0..<4, id: \.self) { i in
                        Circle()
                            .fill(i < pinInput.count ? Color.blue : Color(white: 0.2))
                            .frame(width: 18, height: 18)
                    }
                }
                .padding(.vertical, 8)

                if !error.isEmpty {
                    Text(error)
                        .font(.subheadline)
                        .foregroundColor(.red)
                }

                PinNumpadView(
                    onNumber: { digit in
                        guard !verifying, pinInput.count < 4 else { return }
                        pinInput += digit
                        error = ""
                        if pinInput.count == 4 { submit() }
                    },
                    onClear: { pinInput = ""; error = "" },
                    onBackspace: { if !pinInput.isEmpty { pinInput.removeLast() }; error = "" }
                )
                .disabled(verifying)
                .opacity(verifying ? 0.4 : 1)
                .overlay { if verifying { ProgressView().tint(.white) } }
            }
            .padding(40)
        }
    }

    private func submit() {
        verifying = true
        Task {
            do {
                let emp = try await APIService.shared.verifyPin(pin: pinInput)
                vm.handleRelockPinSuccess(empId: emp.id, empName: emp.name, empRole: emp.role)
                monitor.unlock()
            } catch {
                self.error = "PIN incorrecto"
                pinInput = ""
            }
            verifying = false
        }
    }
}

// MARK: - View modifier

extension View {
    /// Re-bloquea la pantalla actual (sin navegar) tras `monitor.timeout`
    /// segundos de inactividad, cuando `shouldLock()` es true — normalmente
    /// `{ vm.employeeId != nil }`, o algo más específico (p.ej. excluir la
    /// pantalla de cliente, como hace Bruma POS).
    func sessionAutoLock(_ monitor: SessionLockMonitor, vm: POSViewModel, shouldLock: @escaping () -> Bool) -> some View {
        modifier(SessionAutoLockModifier(monitor: monitor, vm: vm, shouldLock: shouldLock))
    }
}

private struct SessionAutoLockModifier: ViewModifier {
    @ObservedObject var monitor: SessionLockMonitor
    @ObservedObject var vm: POSViewModel
    let shouldLock: () -> Bool

    func body(content: Content) -> some View {
        content
            .background(LockTouchMonitorView { monitor.registerActivity() })
            .overlay {
                if monitor.isLocked {
                    PinRelockOverlay(vm: vm, monitor: monitor)
                        .transition(.opacity)
                        .zIndex(998)
                }
            }
            .onAppear {
                monitor.shouldLock = shouldLock
                monitor.start()
            }
    }
}
