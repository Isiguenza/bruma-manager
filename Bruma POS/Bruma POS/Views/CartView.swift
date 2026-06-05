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
