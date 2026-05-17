import SwiftUI

struct CartView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            cartHeader
                .padding(16)
            
            // Employee order tabs
            if vm.isEmployeeOrder {
                HStack(spacing: 0) {
                    Button {
                        vm.employeeOrderTab = 0
                    } label: {
                        Text("Orden Actual")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(vm.employeeOrderTab == 0 ? .white : .gray)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(vm.employeeOrderTab == 0 ? Color.blue.opacity(0.15) : Color.clear)
                    }
                    
                    Button {
                        vm.employeeOrderTab = 1
                        Task { await vm.fetchEmployeeOrderHistory() }
                    } label: {
                        Text("Historial")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(vm.employeeOrderTab == 1 ? .white : .gray)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(vm.employeeOrderTab == 1 ? Color.blue.opacity(0.15) : Color.clear)
                    }
                }
                .background(Color.white.opacity(0.04))
            }
            
            Rectangle().fill(Color(white: 0.12)).frame(height: 1)
            
            if vm.isEmployeeOrder && vm.employeeOrderTab == 1 {
                EmployeeOrderHistoryView(vm: vm)
            } else if vm.cart.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Text("Carrito vacío")
                        .font(.subheadline)
                        .foregroundColor(Color(white: 0.5))
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        // Group by course and seat like /bar
                        let seatOrder = vm.selectedTable != nil 
                            ? Array(1...vm.guestCount).map { "A\($0)" } + ["C"]
                            : ["C"]
                        
                        let sortedCart = vm.cart.enumerated().map { (index: $0, item: $1) }
                            .sorted { a, b in
                                let courseA = a.item.course
                                let courseB = b.item.course
                                if courseA != courseB { return courseA < courseB }
                                
                                if vm.selectedTable != nil {
                                    let aIdx = seatOrder.firstIndex(of: a.item.seat) ?? 999
                                    let bIdx = seatOrder.firstIndex(of: b.item.seat) ?? 999
                                    return aIdx < bIdx
                                }
                                return false
                            }
                        
                        let maxCourse = vm.cart.map { $0.course }.max() ?? 1
                        let showCourseHeaders = maxCourse > 1
                        
                        var lastCourse = 0
                        var lastSeat = ""
                        
                        ForEach(Array(sortedCart.enumerated()), id: \.offset) { arrayIndex, element in
                            let index = element.index
                            let item = element.item
                            let itemCourse = item.course
                            
                            // Check if we need to show headers
                            let showCourseHeader = showCourseHeaders && itemCourse != lastCourse
                            let showSeatHeader = vm.selectedTable != nil && item.seat != lastSeat
                            
                            // Update tracking variables
                            let _ = {
                                if showCourseHeader {
                                    lastCourse = itemCourse
                                    lastSeat = "" // Reset seat when course changes
                                }
                                if showSeatHeader {
                                    lastSeat = item.seat
                                }
                            }()
                            
                            VStack(alignment: .leading, spacing: 4) {
                                if showCourseHeader {
                                    HStack(spacing: 6) {
                                        Text("T\(itemCourse)")
                                            .font(.caption.weight(.bold))
                                        Text("•")
                                            .foregroundColor(Color(white: 0.4))
                                        Text("Tiempo \(itemCourse)")
                                            .font(.caption.weight(.semibold))
                                    }
                                    .foregroundColor(.green)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 6)
                                    .background(Color.green.opacity(0.1))
                                    .cornerRadius(8)
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green.opacity(0.3), lineWidth: 1))
                                    .padding(.top, arrayIndex == 0 ? 0 : 8)
                                }
                                
                                if showSeatHeader {
                                    HStack(spacing: 6) {
                                        Image(systemName: item.seat == "C" ? "fork.knife" : "person.fill")
                                            .font(.caption2)
                                        Text(item.seat == "C" ? "Centro (compartido)" : "Asiento \(item.seat)")
                                            .font(.caption.weight(.semibold))
                                    }
                                    .foregroundColor(item.seat == "C" ? .orange : .blue)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .padding(.top, showCourseHeader ? 4 : (arrayIndex == 0 ? 0 : 8))
                                }
                                
                                CartItemRow(item: item, index: index, vm: vm)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            
            Rectangle().fill(Color(white: 0.12)).frame(height: 1)
            
            cartFooter
                .padding(16)
        }
        .background(Color(red: 0.04, green: 0.04, blue: 0.05))
    }
    
    private var cartHeader: some View {
        VStack(spacing: 12) {
            if vm.selectedTable != nil || !vm.customerName.isEmpty {
                HStack(spacing: 8) {
                    // Back to tables button
                    Button { 
                        vm.currentScreen = .tableSelection
                        Task { await vm.refreshTables() }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(10)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.15), lineWidth: 1))
                    }
                    
                    // Table/Customer button with context menu
                    Menu {
                        if vm.selectedTable != nil {
                            Button(role: .destructive) {
                                vm.handleReleaseTable()
                            } label: {
                                Label("Liberar Mesa", systemImage: "door.open")
                            }
                            
                            Divider()
                        } else {
                            // For delivery/takeout orders
                            Button(role: .destructive) {
                                vm.handleReleaseTable()
                            } label: {
                                Label("Liberar Orden", systemImage: "trash")
                            }
                            
                            Divider()
                        }
                        
                        Button {
                            vm.handleChangeTable()
                        } label: {
                            Label("Cambiar Mesa", systemImage: "arrow.left.arrow.right")
                        }
                        
                        Button {
                            vm.tempGuestCount = vm.guestCount
                            vm.showGuestCountDialog = true
                        } label: {
                            Label("Cambiar Comensales", systemImage: "person.2")
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if let table = vm.selectedTable {
                                Image(systemName: "cup.and.saucer.fill")
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                Text(table.displayName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            } else {
                                Image(systemName: "bag.fill")
                                    .font(.subheadline)
                                    .foregroundColor(.blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Para Llevar")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                    if !vm.customerName.isEmpty {
                                        Text(vm.customerName)
                                            .font(.caption2)
                                            .foregroundColor(.gray)
                                    }
                                }
                                Image(systemName: "chevron.down")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.1), lineWidth: 1))
                    }
                    
                    // Guest count button
                    Button {
                        vm.tempGuestCount = vm.guestCount
                        vm.showGuestCountDialog = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(.caption)
                            Text("\(vm.guestCount)")
                                .font(.subheadline.weight(.medium))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color.blue.opacity(0.15))
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.blue.opacity(0.3), lineWidth: 1))
                    }
                }
            }
            
            HStack {
                Text("Orden")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.gray)
                Spacer()
                Menu {
                    Button { vm.qrDialogOpen = true } label: { Label("Leer QR", systemImage: "qrcode") }
                    Button { vm.manualStampDialogOpen = true } label: { Label("Asignar sellos", systemImage: "barcode.viewfinder") }
                } label: {
                    Image(systemName: "ellipsis").font(.body).foregroundColor(Color(white: 0.5)).padding(4)
                }
                Text(vm.formatCurrency(vm.cartTotal)).font(.subheadline.bold()).foregroundColor(.white)
            }
            
            // Seat buttons
            if vm.selectedTable != nil && vm.guestCount > 0 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(1...vm.guestCount, id: \.self) { i in
                            Button { vm.activeSeat = "A\(i)" } label: {
                                Text("A\(i)")
                                    .font(.caption.weight(.medium))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(vm.activeSeat == "A\(i)" ? Color.blue.opacity(0.2) : Color.white.opacity(0.05))
                                    .foregroundColor(vm.activeSeat == "A\(i)" ? .blue : .gray)
                                    .cornerRadius(8)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(vm.activeSeat == "A\(i)" ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1)
                                    )
                            }
                        }
                        Button { vm.activeSeat = "C" } label: {
                            Text("C")
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(vm.activeSeat == "C" ? Color.orange.opacity(0.2) : Color.white.opacity(0.05))
                                .foregroundColor(vm.activeSeat == "C" ? .orange : .gray)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(vm.activeSeat == "C" ? Color.orange.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1)
                                )
                        }
                    }
                }
            }
            
            // Course buttons (fixed T1-T4)
            if !vm.cart.isEmpty {
                HStack(spacing: 6) {
                    ForEach(1...4, id: \.self) { c in
                        Button { vm.activeCourse = c } label: {
                            Text("T\(c)")
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(vm.activeCourse == c ? Color.green.opacity(0.2) : Color.white.opacity(0.05))
                                .foregroundColor(vm.activeCourse == c ? .green : .gray)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(vm.activeCourse == c ? Color.green.opacity(0.4) : Color.white.opacity(0.1), lineWidth: 1)
                                )
                        }
                    }
                    Spacer()
                }
            }
            
            // Loyalty card
            if let card = vm.loyaltyCard {
                HStack(spacing: 12) {
                    Image(systemName: "gift.fill")
                        .font(.subheadline)
                        .foregroundColor(.purple)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.customerName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                        Text("\(card.stamps) sellos • \(card.rewardsAvailable) recompensas")
                            .font(.caption2)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                    Button { vm.loyaltyCard = nil } label: {
                        Image(systemName: "xmark")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                .padding(10)
                .background(Color.purple.opacity(0.08))
                .cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.purple.opacity(0.2), lineWidth: 1))
            }
            
            Text("\(vm.cart.count) \(vm.cart.count == 1 ? "producto" : "productos")")
                .font(.caption)
                .foregroundColor(.gray)
        }
    }
    
    private var cartFooter: some View {
        VStack(spacing: 12) {
            if !vm.cart.isEmpty && vm.cart.contains(where: { !$0.sentToKitchen }) {
                Button {
                    Task { vm.handleSendToKitchen() }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "frying.pan")
                        Text("Enviar a Cocina")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.orange.opacity(0.2))
                    .foregroundColor(.orange)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.orange.opacity(0.4), lineWidth: 1.5))
                }
            }
            
            HStack(spacing: 10) {
                // Print button with context menu
                Menu {
                    Button {
                        Task { await vm.handlePrint() }
                    } label: {
                        Label("Ticket Cuenta", systemImage: "doc.text")
                    }
                    
                    Button {
                        Task { await vm.handlePrintPreTicket() }
                    } label: {
                        Label("Pre-Ticket", systemImage: "doc.plaintext")
                    }
                    
                    Button {
                        Task { await vm.handlePrintPreTicketPDF() }
                    } label: {
                        Label("Pre-Ticket PDF", systemImage: "square.and.arrow.up")
                    }
                } label: {
                    Image(systemName: "printer.fill")
                        .font(.headline)
                        .frame(width: 52, height: 52)
                        .background(Color.white.opacity(0.08))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.15), lineWidth: 1))
                } primaryAction: {
                    Task { await vm.handlePrint() }
                }
                .disabled(vm.cart.isEmpty)
                .opacity(vm.cart.isEmpty ? 0.3 : 1)
                
                // Pay button
                Button {
                    vm.showingPayment = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.fill")
                        Text("Pagar")
                            .font(.headline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(vm.cart.isEmpty ? Color.white.opacity(0.05) : Color.blue.opacity(0.2))
                    .foregroundColor(vm.cart.isEmpty ? .gray : .blue)
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(vm.cart.isEmpty ? Color.white.opacity(0.1) : Color.blue.opacity(0.4), lineWidth: 1.5))
                }
                .disabled(vm.cart.isEmpty)
            }
        }
    }
}

struct CartItemRow: View {
    let item: CartItem
    let index: Int
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Row 1: Product name + price + trash
            HStack(alignment: .top, spacing: 8) {
                Text("\(item.quantity)×")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.gray)
                
                Text(item.productName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
                
                Spacer()
                
                Text(vm.formatCurrency(item.unitPrice * Double(item.quantity)))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(item.isGuest ? .gray : .white)
                    .strikethrough(item.isGuest)
                
                Button { vm.removeFromCart(at: index) } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundColor(.red.opacity(0.7))
                }
            }
            
            // Modifiers
            if let f = item.frostingName {
                HStack(spacing: 4) {
                    Text("↳").foregroundColor(.gray)
                    Text(f)
                }.font(.caption2).foregroundColor(Color(white: 0.55))
            }
            if let t = item.dryToppingName {
                HStack(spacing: 4) {
                    Text("↳").foregroundColor(.gray)
                    Text(t)
                }.font(.caption2).foregroundColor(Color(white: 0.55))
            }
            if let e = item.extraName {
                HStack(spacing: 4) {
                    Text("↳").foregroundColor(.gray)
                    Text(e)
                }.font(.caption2).foregroundColor(Color(white: 0.55))
            }
            
            // Custom modifiers
            if let cm = item.customModifiers,
               let data = cm.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                ForEach(Array(json.keys.sorted()), id: \.self) { key in
                    if let stepDict = json[key] as? [String: Any],
                       let options = stepDict["options"] as? [[String: Any]] {
                        ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                            if let name = opt["name"] as? String {
                                HStack(spacing: 4) {
                                    Text("↳").foregroundColor(.gray)
                                    Text(name)
                                }.font(.caption2).foregroundColor(Color(white: 0.55))
                            }
                        }
                    }
                }
            }
            
            // Notes
            if !item.notes.isEmpty {
                HStack(spacing: 4) {
                    Text("↳")
                        .font(.caption2)
                        .foregroundColor(.orange.opacity(0.8))
                    Text(item.notes)
                        .italic()
                        .font(.caption2)
                        .foregroundColor(.orange.opacity(0.9))
                }
            }
            
            // Status badge
            if item.sentToKitchen {
                HStack(spacing: 6) {
                    if item.deliveredToTable {
                        Label("Entregado", systemImage: "checkmark.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.blue)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.blue.opacity(0.12))
                            .cornerRadius(6)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.blue.opacity(0.2), lineWidth: 1))
                    } else if item.orderStatus == "ready" {
                        Label("Listo", systemImage: "checkmark.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.green.opacity(0.12))
                            .cornerRadius(6)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.green.opacity(0.2), lineWidth: 1))
                    } else {
                        Label("En cocina", systemImage: "frying.pan")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.orange)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.orange.opacity(0.12))
                            .cornerRadius(6)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.orange.opacity(0.2), lineWidth: 1))
                    }
                    
                    Spacer()
                    
                    Text(vm.formatCurrency(item.unitPrice) + " c/u")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            
            // Quantity controls — only if NOT sent to kitchen
            if !item.sentToKitchen {
                HStack(spacing: 8) {
                    Button {
                        vm.updateCartQuantity(at: index, delta: -1)
                    } label: {
                        Image(systemName: "minus")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color.red.opacity(0.15)))
                            .overlay(Circle().stroke(Color.red.opacity(0.3), lineWidth: 1))
                    }
                    
                    Text("\(item.quantity)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .frame(minWidth: 24)
                    
                    Button {
                        vm.updateCartQuantity(at: index, delta: 1)
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color.blue.opacity(0.15)))
                            .overlay(Circle().stroke(Color.blue.opacity(0.3), lineWidth: 1))
                    }
                    
                    Spacer()
                    
                    Text(vm.formatCurrency(item.unitPrice) + " c/u")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.04))
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .contextMenu {
            // Only show context menu if item hasn't been sent to kitchen
            if !item.sentToKitchen {
                // Change seat submenu
                if vm.selectedTable != nil && vm.guestCount > 0 {
                    Menu {
                        ForEach(1...vm.guestCount, id: \.self) { seatNum in
                            Button {
                                vm.changeSeat(at: index, to: "A\(seatNum)")
                            } label: {
                                HStack {
                                    Text("Asiento A\(seatNum)")
                                    if item.seat == "A\(seatNum)" {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                        Button {
                            vm.changeSeat(at: index, to: "C")
                        } label: {
                            HStack {
                                Text("Centro (compartido)")
                                if item.seat == "C" {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    } label: {
                        Label("Cambiar Asiento", systemImage: "person.fill")
                    }
                }
                
                // Change course submenu
                Menu {
                    ForEach(1...5, id: \.self) { courseNum in
                        Button {
                            vm.changeCourse(at: index, to: courseNum)
                        } label: {
                            HStack {
                                Text("Tiempo \(courseNum)")
                                if item.course == courseNum {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Label("Cambiar Tiempo", systemImage: "clock.fill")
                }
                
                Divider()
                
                Button(role: .destructive) {
                    vm.removeFromCart(at: index)
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            } else {
                Text("Item ya enviado a cocina")
                    .foregroundColor(.gray)
            }
        }
        .alert(vm.selectedTable != nil ? "¿Liberar Mesa?" : "¿Liberar Orden?", isPresented: $vm.showingReleaseConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Liberar", role: .destructive) {
                vm.executeReleaseTable()
            }
        } message: {
            let orderType = vm.selectedTable != nil ? "Mesa \(vm.selectedTable!.number)" : "Orden Para Llevar"
            Text("¿Liberar \(orderType)?\n\nHay \(vm.cart.count) items en el carrito que se perderán.")
        }
    }
}
