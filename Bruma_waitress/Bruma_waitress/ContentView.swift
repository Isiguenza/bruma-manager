import SwiftUI

struct ContentView: View {
    @StateObject private var authVM = AuthViewModel()
    @StateObject private var tablesVM = TablesViewModel()
    @StateObject private var ordersVM = OrdersViewModel()
    
    @State private var selectedTab: AppTab = .tables
    @State private var activeTableContext: TableContext?
    
    enum AppTab {
        case tables
        case orders
        case loyalty
    }
    
    struct TableContext: Identifiable {
        let id = UUID()
        let table: Table?
        let customerName: String?
        let guestCount: Int
    }
    
    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.05, blue: 0.05)
                .ignoresSafeArea()
            
            if !authVM.isAuthenticated {
                LoginView(authVM: authVM)
                    .task { await authVM.checkCashRegister() }
            } else {
                VStack(spacing: 0) {
                    topBar
                    
                    TabView(selection: $selectedTab) {
                        TableSelectionView(tablesVM: tablesVM) {
                            activeTableContext = TableContext(
                                table: tablesVM.selectedTable,
                                customerName: tablesVM.isParaLlevar ? tablesVM.customerName : nil,
                                guestCount: tablesVM.guestCount
                            )
                        }
                        .tabItem {
                            Label("Mesas", systemImage: "square.grid.2x2")
                        }
                        .tag(AppTab.tables)
                        
                        ActiveOrdersView(ordersVM: ordersVM)
                        .tabItem {
                            Label("Ordenes", systemImage: "clock")
                        }
                        .tag(AppTab.orders)

                        LoyaltyView()
                        .tabItem {
                            Label("Lealtad", systemImage: "star.circle")
                        }
                        .tag(AppTab.loyalty)
                    }
                }
                .fullScreenCover(item: $activeTableContext) { ctx in
                    OrderTakingView(
                        table: ctx.table,
                        customerName: ctx.customerName,
                        guestCount: ctx.guestCount,
                        employeeName: authVM.employeeName,
                        onDismiss: {
                            activeTableContext = nil
                            Task { await tablesVM.fetchTables() }
                        }
                    )
                }
            }
        }
        .preferredColorScheme(.dark)
    }
    
    // MARK: - Top Bar
    
    private var topBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Bruma")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                Text(authVM.employeeName)
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Button(action: { authVM.logout() }) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07))
    }
    
}

#Preview {
    ContentView()
}
