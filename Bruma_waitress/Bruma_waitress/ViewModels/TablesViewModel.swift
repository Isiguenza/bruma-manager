import Foundation
import Combine

@MainActor
class TablesViewModel: ObservableObject {
    @Published var tables: [Table] = []
    @Published var deliveryOrders: [Order] = []
    @Published var loading: Bool = false
    @Published var selectedTable: Table?
    @Published var showCustomerNameDialog: Bool = false
    @Published var customerName: String = ""
    @Published var isParaLlevar: Bool = false
    
    // Guest count for the table
    @Published var guestCount: Int = 2
    @Published var showGuestCountDialog: Bool = false

    // Poll de respaldo (mismo patrón que Bruma POS: el socket es la vía
    // principal, esto es solo red de seguridad si se cae momentáneamente).
    private var backupPollTimer: Timer?

    func startBackupPolling() {
        stopBackupPolling()
        backupPollTimer = Timer.scheduledTimer(withTimeInterval: 50, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.fetchTables()
                await self?.fetchDeliveryOrders()
            }
        }
    }

    func stopBackupPolling() {
        backupPollTimer?.invalidate()
        backupPollTimer = nil
    }

    /// Refresca una sola mesa desde el servidor (llamado desde el socket) —
    /// autoritativo: reemplaza la mesa completa en vez de parchar campos
    /// sueltos, así nunca queda una mesa a medias entre dos formas de leerla.
    func refreshTable(tableId: String) async {
        guard let index = tables.firstIndex(where: { $0.id == tableId }) else {
            // Mesa nueva que no teníamos en la lista (p.ej. layout cambió) —
            // mejor refrescar todo en vez de insertarla a ciegas.
            await fetchTables()
            return
        }
        do {
            let updated = try await APIService.shared.fetchTableDetail(tableId: tableId)
            tables[index] = updated
        } catch {
            print("Error refreshing table:", error)
        }
    }

    func fetchTables() async {
        loading = true
        do {
            tables = try await APIService.shared.fetchTables()
                .filter { $0.active }
                .sorted { ($0.number.localizedStandardCompare($1.number)) == .orderedAscending }
        } catch {
            print("Error fetching tables:", error)
        }
        loading = false
    }
    
    func fetchDeliveryOrders() async {
        do {
            // Fetch all unpaid Para Llevar orders (no table, not paid)
            let allOrders = try await APIService.shared.fetchDeliveryOrders()
            // Group by customer name to consolidate multiple orders from same customer
            var grouped: [String: Order] = [:]
            for order in allOrders {
                let key = order.customerName ?? "Sin Nombre"
                if grouped[key] == nil {
                    grouped[key] = order
                }
            }
            deliveryOrders = Array(grouped.values).sorted {
                ($0.createdAt ?? "") > ($1.createdAt ?? "")
            }
        } catch {
            print("Error fetching delivery orders:", error)
        }
    }
    
    func selectTable(_ table: Table) {
        selectedTable = table
        isParaLlevar = false
        customerName = ""
        guestCount = 2
        showGuestCountDialog = true
    }
    
    func selectParaLlevar() {
        selectedTable = nil
        isParaLlevar = true
        showCustomerNameDialog = true
    }
    
    func confirmParaLlevar() {
        showCustomerNameDialog = false
    }
    
    func confirmGuestCount() {
        showGuestCountDialog = false
        
        // Save guest count to database
        if let table = selectedTable {
            Task {
                do {
                    let _ = try await APIService.shared.updateTable(
                        tableId: table.id,
                        body: ["guestCount": guestCount]
                    )
                } catch {
                    print("Error updating guest count:", error)
                }
            }
        }
    }
    
    func reset() {
        selectedTable = nil
        isParaLlevar = false
        customerName = ""
        guestCount = 2
    }
}
