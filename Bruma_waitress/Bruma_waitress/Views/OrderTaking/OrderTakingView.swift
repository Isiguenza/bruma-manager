import SwiftUI

struct OrderTakingView: View {
    let table: Table?
    let customerName: String?
    let guestCount: Int
    let employeeName: String
    let onDismiss: () -> Void
    
    @StateObject private var menuVM = MenuViewModel()
    @StateObject private var cartVM = CartViewModel()
    @State private var showCart = false
    @State private var showConfirmExit = false
    @Environment(\.dismiss) private var dismiss
    
    var titleText: String {
        if let t = table { return "Mesa \(t.number)" }
        if let n = customerName, !n.isEmpty { return n }
        return "Para Llevar"
    }
    
    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.05, blue: 0.05).ignoresSafeArea()
            
            VStack(spacing: 0) {
                headerBar
                seatCourseBar
                menuContent
                bottomBar
            }
        }
        .overlay(
            Group {
                if cartVM.showKitchenConfirmation {
                    KitchenSuccessView {
                        cartVM.showKitchenConfirmation = false
                        dismiss()
                        onDismiss()
                    }
                }
            }
        )
        .preferredColorScheme(.dark)
        .onAppear {
            cartVM.setupForTable(table, customerName: customerName, guestCount: guestCount)
        }
        .sheet(isPresented: $showCart) {
            ComandaSheetView(cartVM: cartVM, titleText: titleText)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $menuVM.showVariantSheet) {
            if let product = menuVM.selectedProductForVariant {
                VariantSheet(product: product) { variant in
                    menuVM.handleVariantSelected(
                        variant,
                        seat: cartVM.activeSeat,
                        course: cartVM.activeCourse
                    )
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(isPresented: $menuVM.showModifierFlow) {
            ModifierFlowView(menuVM: menuVM, cartVM: cartVM)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $menuVM.showNotesSheet) {
            NotesSheet(
                productName: menuVM.pendingCartItem?.productName ?? "",
                notes: $menuVM.tempNotes,
                onConfirm: {
                    menuVM.confirmNotes { item in cartVM.addItem(item) }
                },
                onSkip: {
                    menuVM.cancelNotes { item in cartVM.addItem(item) }
                }
            )
            .presentationDetents([.height(280)])
            .presentationDragIndicator(.visible)
        }
        .alert("Salir sin enviar?", isPresented: $showConfirmExit) {
            Button("Cancelar", role: .cancel) {}
            Button("Salir", role: .destructive) {
                dismiss()
                onDismiss()
            }
        } message: {
            Text("Tienes \(cartVM.pendingItems.count) productos sin enviar a cocina.")
        }
    }
    
    // MARK: - Header
    
    private var headerBar: some View {
        HStack(spacing: 12) {
            Button(action: handleBack) {
                Image(systemName: "xmark")
                    .font(.body.weight(.medium))
                    .foregroundColor(.white)
            }
            
            VStack(alignment: .leading, spacing: 1) {
                Text(titleText)
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                Text(employeeName)
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Button(action: { showCart = true }) {
                HStack(spacing: 6) {
                    Image(systemName: "list.bullet.clipboard")
                        .font(.subheadline)
                    if !cartVM.items.isEmpty {
                        Text("\(cartVM.items.count)")
                            .font(.caption.weight(.bold))
                    }
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(cartVM.hasPendingItems ? Color.orange : Color.white.opacity(0.1))
                .cornerRadius(8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(red: 0.07, green: 0.07, blue: 0.07))
    }
    
    // MARK: - Seat & Course
    
    private var seatCourseBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Top row: Seats (scrolls horizontally if needed)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(cartVM.seatLabels, id: \.self) { seat in
                        let count = cartVM.itemCount(for: seat)
                        let isActive = cartVM.activeSeat == seat
                        Button(action: { cartVM.activeSeat = seat }) {
                            HStack(spacing: 4) {
                                if seat == "C" {
                                    Image(systemName: "person.2.fill")
                                        .font(.system(size: 12))
                                } else {
                                    Text(seat)
                                        .font(.caption.weight(.medium))
                                }
                                if count > 0 {
                                    Text("\(count)")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 2)
                                        .background(Color.white.opacity(0.25))
                                        .clipShape(Capsule())
                                }
                            }
                            .foregroundColor(isActive ? .white : .gray)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(isActive ? Color(red: 0.2, green: 0.5, blue: 1.0) : Color.clear)
                            .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal, 3)
                .padding(.vertical, 2)
                .background(Color.white.opacity(0.04))
                .clipShape(Capsule())
                .padding(.horizontal, 12)
            }
            
            // Bottom row: Courses (left-aligned, no scroll needed)
            HStack(spacing: 2) {
                ForEach(1...4, id: \.self) { course in
                    let isActive = cartVM.activeCourse == course
                    Button(action: { cartVM.activeCourse = course }) {
                        Text("T\(course)")
                            .font(.caption.weight(.medium))
                            .foregroundColor(isActive ? .white : .gray)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(isActive ? Color(red: 1.0, green: 0.58, blue: 0.0) : Color.clear)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 3)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.04))
            .clipShape(Capsule())
            .padding(.horizontal, 12)
        }
        .padding(.vertical, 8)
        .background(Color(red: 0.06, green: 0.06, blue: 0.07))
    }
    
    // MARK: - Menu Content
    
    private var menuContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                TextField("Buscar producto...", text: $menuVM.searchQuery)
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                
                if !menuVM.searchQuery.isEmpty {
                    Button(action: { menuVM.searchQuery = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.08))
            .cornerRadius(12)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    CategoryPill(
                        name: "Todos",
                        isSelected: menuVM.selectedCategoryId == nil,
                        action: { menuVM.selectCategory(nil) }
                    )
                    
                    ForEach(menuVM.activeCategories) { cat in
                        CategoryPill(
                            name: cat.name,
                            isSelected: menuVM.selectedCategoryId == cat.id,
                            action: { menuVM.selectCategory(cat.id) }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            
            if menuVM.loading {
                Spacer()
                ProgressView().tint(.white)
                Spacer()
            } else if menuVM.filteredProducts.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                    Text("No hay productos")
                        .foregroundColor(.gray)
                }
                Spacer()
            } else {
                ScrollView(showsIndicators: false) {
                    let columns = [
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10),
                    ]
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(menuVM.filteredProducts) { product in
                            ProductTileView(product: product) {
                                menuVM.handleProductTap(
                                    product,
                                    seat: cartVM.activeSeat,
                                    course: cartVM.activeCourse
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 80)
                }
            }
        }
        .frame(maxHeight: .infinity)
        .task { await menuVM.loadData() }
    }
    
    // MARK: - Bottom Bar
    
    private var bottomBar: some View {
        Group {
            if cartVM.hasPendingItems {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(cartVM.pendingItems.count) pendientes")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Text("$\(cartVM.totalPending, specifier: "%.0f")")
                            .font(.headline.weight(.bold))
                            .foregroundColor(.white)
                    }
                    
                    Spacer()
                    
                    Button(action: {
                        Task {
                            await cartVM.sendToKitchen()
                        }
                    }) {
                        HStack(spacing: 8) {
                            if cartVM.sending {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: "paperplane.fill")
                                Text("Enviar a Cocina")
                                    .font(.subheadline.weight(.semibold))
                            }
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Color.orange)
                        .cornerRadius(12)
                    }
                    .disabled(cartVM.sending)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color(red: 0.07, green: 0.07, blue: 0.07))
            }
        }
    }
    
    // MARK: - Actions
    
    private func handleBack() {
        if cartVM.hasPendingItems {
            showConfirmExit = true
        } else {
            dismiss()
            onDismiss()
        }
    }
}

// MARK: - Comanda Sheet

struct ComandaSheetView: View {
    @ObservedObject var cartVM: CartViewModel
    let titleText: String
    
    private var sortedItems: [(index: Int, item: CartItem)] {
        cartVM.items.enumerated().map { (index: $0.offset, item: $0.element) }
            .sorted { a, b in
                if a.item.course != b.item.course { return a.item.course < b.item.course }
                let seatOrder = cartVM.seatLabels
                let aIdx = seatOrder.firstIndex(of: a.item.seat) ?? 999
                let bIdx = seatOrder.firstIndex(of: b.item.seat) ?? 999
                return aIdx < bIdx
            }
    }
    
    private var maxCourse: Int {
        cartVM.items.map(\.course).max() ?? 1
    }
    
    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.06, blue: 0.06).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Comanda")
                            .font(.headline.weight(.bold))
                            .foregroundColor(.white)
                        Text("\(titleText) - \(cartVM.items.count) productos")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 10)
                
                Divider().background(Color.white.opacity(0.1))
                
                if cartVM.items.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "list.bullet.clipboard")
                            .font(.system(size: 32))
                            .foregroundColor(.gray.opacity(0.5))
                        Text("Sin productos")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 0) {
                            let items = sortedItems
                            var lastCourse = 0
                            var lastSeat = ""
                            
                            ForEach(Array(items.enumerated()), id: \.element.item.id) { arrayIdx, entry in
                                let showCourseHeader = maxCourse > 1 && entry.item.course != (arrayIdx > 0 ? items[arrayIdx - 1].item.course : 0)
                                let prevSeat = arrayIdx > 0 ? items[arrayIdx - 1].item.seat : ""
                                let prevCourse = arrayIdx > 0 ? items[arrayIdx - 1].item.course : 0
                                let showSeatHeader = entry.item.seat != prevSeat || entry.item.course != prevCourse
                                
                                if showCourseHeader {
                                    courseHeader(course: entry.item.course)
                                }
                                
                                if showSeatHeader {
                                    seatHeader(seat: entry.item.seat)
                                }
                                
                                comandaItemRow(entry: entry)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }
                }
                
                Spacer(minLength: 0)
                
                // Bottom send button
                if cartVM.hasPendingItems {
                    VStack(spacing: 0) {
                        Divider().background(Color.white.opacity(0.1))
                        
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(cartVM.pendingItems.count) nuevos")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                Text("$\(cartVM.totalPending, specifier: "%.0f")")
                                    .font(.title3.weight(.bold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Text("Total: $\(cartVM.totalAll, specifier: "%.0f")")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.gray)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                    }
                    .background(Color(red: 0.06, green: 0.06, blue: 0.06))
                }
            }
        }
    }
    
    // MARK: - Course Header (emerald/green like /bar)
    
    private func courseHeader(course: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "clock.fill")
                .font(.caption2)
            Text("T\(course)")
                .font(.caption.weight(.bold))
            Circle()
                .fill(Color(red: 0.2, green: 0.55, blue: 0.35).opacity(0.5))
                .frame(width: 4, height: 4)
            Text("Tiempo \(course)")
                .font(.caption.weight(.semibold))
        }
        .foregroundColor(Color(red: 0.35, green: 0.8, blue: 0.5))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(red: 0.1, green: 0.25, blue: 0.15))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(red: 0.2, green: 0.4, blue: 0.25).opacity(0.5), lineWidth: 1)
                )
        )
        .padding(.top, 12)
        .padding(.bottom, 4)
    }
    
    // MARK: - Seat Header (blue for seats, amber for shared)
    
    private func seatHeader(seat: String) -> some View {
        HStack(spacing: 5) {
            if seat == "C" {
                Image(systemName: "fork.knife")
                    .font(.caption2)
                Text("Centro (compartido)")
                    .font(.caption.weight(.bold))
            } else {
                Image(systemName: "person.fill")
                    .font(.caption2)
                Text("Asiento \(seat)")
                    .font(.caption.weight(.bold))
            }
        }
        .foregroundColor(seat == "C" ? Color(red: 0.9, green: 0.7, blue: 0.3) : Color(red: 0.4, green: 0.6, blue: 1.0))
        .padding(.top, 8)
        .padding(.bottom, 2)
        .padding(.leading, 4)
    }
    
    // MARK: - Item Row
    
    private func comandaItemRow(entry: (index: Int, item: CartItem)) -> some View {
        let item = entry.item
        let idx = entry.index
        
        return HStack(alignment: .top, spacing: 10) {
            // Quantity badge
            Text("\(item.quantity)")
                .font(.caption.weight(.bold))
                .foregroundColor(.white)
                .frame(width: 24, height: 24)
                .background(item.sentToKitchen ? Color.gray.opacity(0.4) : Color.blue)
                .cornerRadius(12)
            
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(item.productName)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(item.sentToKitchen ? .gray : .white)
                        .lineLimit(2)
                    
                    if item.sentToKitchen {
                        Text("En cocina")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.red.opacity(0.7))
                            .cornerRadius(4)
                    }
                }
                
                if !item.modifierSummary.isEmpty {
                    Text(item.modifierSummary)
                        .font(.caption)
                        .foregroundColor(.blue.opacity(0.7))
                }
                
                if !item.notes.isEmpty {
                    HStack(spacing: 3) {
                        Image(systemName: "note.text")
                            .font(.system(size: 9))
                        Text(item.notes)
                            .font(.caption)
                    }
                    .foregroundColor(.yellow.opacity(0.7))
                    .italic()
                }
                
                if !item.sentToKitchen {
                    HStack(spacing: 8) {
                        Button(action: { cartVM.decrementItem(at: idx) }) {
                            Image(systemName: "minus")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(.white)
                                .frame(width: 26, height: 26)
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(6)
                        }
                        Button(action: { cartVM.incrementItem(at: idx) }) {
                            Image(systemName: "plus")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(.white)
                                .frame(width: 26, height: 26)
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(6)
                        }
                    }
                    .padding(.top, 2)
                }
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                Text("$\(item.total, specifier: "%.0f")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(item.sentToKitchen ? .gray : .white)
                
                if !item.sentToKitchen {
                    Button(action: { cartVM.removeItem(at: idx) }) {
                        Image(systemName: "trash")
                            .font(.caption)
                            .foregroundColor(.red.opacity(0.7))
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
        .padding(.vertical, 2)
    }
}
