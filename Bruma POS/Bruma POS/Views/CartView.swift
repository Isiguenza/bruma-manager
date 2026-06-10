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
                VStack(spacing: 14) {
                    Image(systemName: "cart.badge.plus")
                        .font(.system(size: 44, weight: .light))
                        .foregroundColor(Color(white: 0.25))
                    Text("Carrito vacío")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(white: 0.45))
                    Text("Selecciona productos del menú para comenzar")
                        .font(.caption)
                        .foregroundColor(Color(white: 0.35))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(vm.cartRenderElements) { renderElement in
                            switch renderElement {
                            case .promotionGroup(let group, let showCourseHeader, let showSeatHeader):
                                VStack(alignment: .leading, spacing: 4) {
                                    if showCourseHeader, let firstItem = group.items.first?.item {
                                        HStack(spacing: 6) {
                                            Text("T\(firstItem.course)")
                                                .font(.caption.weight(.bold))
                                            Text("•")
                                                .foregroundColor(Color(white: 0.4))
                                            Text("Tiempo \(firstItem.course)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(.green)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(Color.green.opacity(0.1))
                                        .cornerRadius(8)
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green.opacity(0.3), lineWidth: 1))
                                    }
                                    
                                    if showSeatHeader, let firstItem = group.items.first?.item {
                                        HStack(spacing: 6) {
                                            Image(systemName: firstItem.seat == "C" ? "fork.knife" : "person.fill")
                                                .font(.caption2)
                                            Text(firstItem.seat == "C" ? "Centro (compartido)" : "Asiento \(firstItem.seat)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(firstItem.seat == "C" ? .orange : .blue)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .padding(.top, showCourseHeader ? 4 : 0)
                                    }
                                    
                                    PromotionGroupView(group: group, vm: vm)
                                        .padding(.top, 4)
                                }
                            
                            case .item(let index, let item, let showCourseHeader, let showSeatHeader):
                                VStack(alignment: .leading, spacing: 4) {
                                    if showCourseHeader {
                                        HStack(spacing: 6) {
                                            Text("T\(item.course)")
                                                .font(.caption.weight(.bold))
                                            Text("•")
                                                .foregroundColor(Color(white: 0.4))
                                            Text("Tiempo \(item.course)")
                                                .font(.caption.weight(.semibold))
                                        }
                                        .foregroundColor(.green)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 6)
                                        .background(Color.green.opacity(0.1))
                                        .cornerRadius(8)
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.green.opacity(0.3), lineWidth: 1))
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
                                        .padding(.top, showCourseHeader ? 4 : 0)
                                    }
                                    
                                    CartItemRow(item: item, index: index, vm: vm)
                                }
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
        .alert("Liberar Mesa", isPresented: $vm.showingReleaseConfirmation) {
            Button("Cancelar", role: .cancel) { }
            Button("Liberar", role: .destructive) {
                print("🔥 Alert confirm: calling executeReleaseTable()")
                vm.executeReleaseTable()
            }
        } message: {
            Text("Hay \(vm.cart.count) items en el carrito que se perderán. ¿Deseas liberar la mesa?")
        }
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
                                print("🔥 Menu tapped: Liberar Mesa")
                                vm.handleReleaseTable()
                            } label: {
                                Label("Liberar Mesa", systemImage: "door.open")
                            }
                            
                            Divider()
                        } else {
                            // For delivery/takeout orders
                            Button(role: .destructive) {
                                print("🔥 Menu tapped: Liberar Orden")
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
            
            HStack(spacing: 0) {
                Text("Orden")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.gray)
                Spacer()
                Text(vm.formatCurrency(vm.cartTotal))
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                Menu {
                    Button { vm.qrDialogOpen = true } label: { Label("Leer QR", systemImage: "qrcode") }
                    Button { vm.manualStampDialogOpen = true } label: { Label("Asignar sellos", systemImage: "barcode.viewfinder") }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.body)
                        .foregroundColor(Color(white: 0.4))
                        .padding(.leading, 8)
                        .padding(.vertical, 4)
                }
            }
            
            // Seat selector
            if vm.selectedTable != nil && vm.guestCount > 0 {
                let seats = (1...vm.guestCount).map { "A\($0)" } + ["C"]
                HStack(spacing: 4) {
                    ForEach(seats, id: \.self) { seat in
                        let isActive = vm.activeSeat == seat
                        let isCenter = seat == "C"
                        Button { vm.activeSeat = seat } label: {
                            HStack(spacing: 4) {
                                Image(systemName: isCenter ? "fork.knife" : "person.fill")
                                    .font(.system(size: 10, weight: .medium))
                                Text(seat)
                                    .font(.caption.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(isActive
                                ? (isCenter ? Color.orange : Color.blue).opacity(0.15)
                                : Color.white.opacity(0.04))
                            .foregroundColor(isActive
                                ? (isCenter ? .orange : .blue)
                                : Color(white: 0.45))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isActive
                                        ? (isCenter ? Color.orange : Color.blue).opacity(0.35)
                                        : Color.white.opacity(0.06), lineWidth: 1)
                            )
                        }
                    }
                }
            }
            
            // Course selector (T1-T4)
            if !vm.cart.isEmpty {
                HStack(spacing: 4) {
                    ForEach(1...4, id: \.self) { c in
                        let isActive = vm.activeCourse == c
                        Button { vm.activeCourse = c } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "clock")
                                    .font(.system(size: 9, weight: .medium))
                                Text("T\(c)")
                                    .font(.caption.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(isActive ? Color.green.opacity(0.15) : Color.white.opacity(0.04))
                            .foregroundColor(isActive ? .green : Color(white: 0.45))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(isActive ? Color.green.opacity(0.35) : Color.white.opacity(0.06), lineWidth: 1)
                            )
                        }
                    }
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
            // Home delivery toggle (only for Para Llevar orders)
            if vm.selectedTable == nil && !vm.isEmployeeOrder && !vm.isPlatformDelivery && !vm.cart.isEmpty {
                HStack(spacing: 8) {
                    Button {
                        vm.toggleHomeDelivery()
                    } label: {
                        Image(systemName: vm.isHomeDelivery ? "checkmark.square.fill" : "square")
                            .font(.subheadline)
                            .foregroundColor(vm.isHomeDelivery ? .blue : .gray)
                    }
                    
                    Text("Envío a domicilio")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    if vm.isHomeDelivery {
                        Text("+\(vm.formatCurrency(vm.homeDeliveryFee))")
                            .font(.caption.weight(.bold))
                            .foregroundColor(.blue)
                    }
                }
                .padding(.horizontal, 4)
            }
            
            // Show delivery fee in subtotal breakdown
            if vm.isHomeDelivery && !vm.cart.isEmpty {
                HStack {
                    Text("Envío a domicilio")
                        .font(.caption)
                        .foregroundColor(.blue)
                    Spacer()
                    Text("+\(vm.formatCurrency(vm.homeDeliveryFee))")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.blue)
                }
                .padding(.horizontal, 4)
            }
            
            if !vm.cart.isEmpty && vm.cart.contains(where: { !$0.sentToKitchen }) {
                Button {
                    vm.handleSendToKitchen()
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
            
            HStack(spacing: 12) {
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
                        .frame(width: 54, height: 54)
                        .background(Color.white.opacity(0.08))
                        .foregroundColor(.white)
                        .cornerRadius(14)
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
