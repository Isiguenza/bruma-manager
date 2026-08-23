import SwiftUI

/// Router raíz: login → tabs (Mesas / Órdenes / Lealtad) → toma de pedido.
/// A diferencia del `switch` instantáneo de `ContentView` en Bruma POS, aquí
/// sí animamos la transición mesas→pedido (gap real que tiene POS hoy) con
/// un push suave en vez de un corte seco.
struct ComandasRootView: View {
    @ObservedObject var vm: POSViewModel
    @State private var selectedTab: ComandasTab = .tables

    enum ComandasTab {
        case tables, loyalty
    }

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()

            switch vm.currentScreen {
            case .dashboard:
                ComandasLoginView(vm: vm)
                    .transition(.opacity)

            case .tableSelection:
                tabsContainer
                    .transition(.opacity)

            case .pos:
                ComandasOrderTakingView(vm: vm)
                    .transition(.move(edge: .trailing).combined(with: .opacity))

            case .customerDisplay:
                // Esta app nunca activa la pantalla de cliente — si el estado
                // llegara a caer aquí (p.ej. por un valor viejo restaurado),
                // regresamos a mesas en vez de mostrar una pantalla vacía.
                Color.clear
                    .onAppear { vm.currentScreen = .tableSelection }
            }

            ComandasToastOverlay(vm: vm)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: vm.currentScreen)
        .onAppear {
            // POSViewModel.restoreSession() (llamado en su init) ya recupera
            // la sesión guardada y refresca datos, pero NO reinicia el poll
            // de respaldo de 60s (eso solo pasa en handlePinSuccess) — lo
            // arrancamos aquí para que una sesión restaurada por relanzar la
            // app también tenga el poll de respaldo activo.
            if vm.currentScreen != .dashboard {
                vm.startPolling()
            }
        }
    }

    // Tab bar nativa (TabView), no la barra custom que se usaba antes — se
    // ve/comporta como el resto de iOS (blur, safe-area, selección) sin
    // tener que reimplementar eso a mano.
    private var tabsContainer: some View {
        TabView(selection: $selectedTab) {
            ComandasTableGridView(vm: vm)
                .tabItem { Label("Mesas", systemImage: "square.grid.2x2.fill") }
                .tag(ComandasTab.tables)

            ComandasLoyaltyView(vm: vm)
                .tabItem { Label("Lealtad", systemImage: "star.circle.fill") }
                .tag(ComandasTab.loyalty)
        }
        .tint(.blue)
    }
}

/// Mismo patrón que el toast de `MainPOSView` en Bruma POS
/// (`vm.showToast`) — cápsula desde abajo, spring, autodesaparece solo (ya
/// lo hace `showToast` en `POSViewModel`).
private struct ComandasToastOverlay: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        if let toast = vm.toastMessage {
            VStack {
                Spacer()
                HStack(spacing: 10) {
                    Image(systemName: vm.toastIsError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                        .foregroundColor(vm.toastIsError ? .red : .green)
                    Text(toast)
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(
                    Capsule()
                        .fill(Color(white: 0.15))
                        .shadow(color: .black.opacity(0.4), radius: 10)
                )
                .padding(.bottom, 30)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.spring(), value: vm.toastMessage)
        }
    }
}
