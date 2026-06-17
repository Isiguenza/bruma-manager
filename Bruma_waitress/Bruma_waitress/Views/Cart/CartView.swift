import SwiftUI

struct CartView: View {
    @ObservedObject var cartVM: CartViewModel
    @Binding var isPresented: Bool
    
    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.06, blue: 0.06).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Carrito")
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    if let table = cartVM.selectedTable {
                        Text("Mesa \(table.number)")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    } else if let name = cartVM.customerName, !name.isEmpty {
                        Text(name)
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    } else {
                        Text("Para Llevar")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 8)
                
                // Seat selector
                SeatPicker(
                    seats: cartVM.seatLabels,
                    activeSeat: $cartVM.activeSeat,
                    activeCourse: $cartVM.activeCourse
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                
                Divider().background(Color.white.opacity(0.1))
                
                // Cart items
                if cartVM.items.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "cart")
                            .font(.system(size: 36))
                            .foregroundColor(.gray)
                        Text("Carrito vacío")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 0) {
                            // Sent items (non-editable)
                            if !cartVM.sentItems.isEmpty {
                                SectionHeader(title: "Enviados a cocina", color: .green)
                                ForEach(Array(cartVM.sentItems.enumerated()), id: \.element.id) { idx, item in
                                    CartItemRow(item: item, editable: false)
                                }
                            }
                            
                            // Pending items
                            if !cartVM.pendingItems.isEmpty {
                                SectionHeader(title: "Pendientes", color: .orange)
                                ForEach(Array(cartVM.items.enumerated()), id: \.element.id) { idx, item in
                                    if !item.sentToKitchen {
                                        CartItemRow(
                                            item: item,
                                            editable: true,
                                            onIncrement: { cartVM.incrementItem(at: idx) },
                                            onDecrement: { cartVM.decrementItem(at: idx) },
                                            onRemove: { cartVM.removeItem(at: idx) },
                                            cartVM: cartVM,
                                            index: idx
                                        )
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }
                }
                
                Spacer(minLength: 0)
                
                // Bottom bar
                VStack(spacing: 8) {
                    Divider().background(Color.white.opacity(0.1))
                    
                    if cartVM.hasPendingItems {
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
                            
                            Button(action: {
                                Task {
                                    await cartVM.sendToKitchen()
                                }
                            }) {
                                HStack(spacing: 8) {
                                    if cartVM.sending {
                                        ProgressView().tint(.white)
                                    } else {
                                        Image(systemName: "flame.fill")
                                            .font(.callout)
                                        Text("Enviar a Cocina")
                                            .font(.subheadline.weight(.semibold))
                                    }
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 12)
                            }
                            .buttonStyle(.glassProminent)
                            .tint(.orange)
                            .disabled(cartVM.sending)
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                    }
                }
                .background(Color(red: 0.06, green: 0.06, blue: 0.06))
            }
        }
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    let color: Color
    
    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundColor(color)
            Spacer()
        }
        .padding(.top, 12)
        .padding(.bottom, 4)
    }
}

// MARK: - Cart Item Row

struct CartItemRow: View {
    let item: CartItem
    var editable: Bool = false
    var onIncrement: (() -> Void)?
    var onDecrement: (() -> Void)?
    var onRemove: (() -> Void)?
    var cartVM: CartViewModel?
    var index: Int?
    
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.productName)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(item.sentToKitchen ? .gray : .white)
                    .lineLimit(2)
                
                if !item.modifierSummary.isEmpty {
                    Text(item.modifierSummary)
                        .font(.caption)
                        .foregroundColor(.blue.opacity(0.7))
                }
                
                if !item.notes.isEmpty {
                    Text(item.notes)
                        .font(.caption)
                        .foregroundColor(.orange.opacity(0.8))
                }
                
                HStack(spacing: 6) {
                    Text(item.seat == "C" ? "Compartido" : "Asiento \(item.seat)")
                        .font(.caption2)
                        .foregroundColor(.gray)
                    Text("•")
                        .foregroundColor(.gray.opacity(0.5))
                    Text("T\(item.course)")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                Text("$\(item.total, specifier: "%.0f")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(item.sentToKitchen ? .gray : .white)
                
                if editable {
                    HStack(spacing: 0) {
                        Button(action: { onDecrement?() }) {
                            Image(systemName: "minus")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(.white)
                                .frame(width: 28, height: 28)
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(6)
                        }
                        
                        Text("\(item.quantity)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                            .frame(width: 32)
                        
                        Button(action: { onIncrement?() }) {
                            Image(systemName: "plus")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(.white)
                                .frame(width: 28, height: 28)
                                .background(Color.blue)
                                .cornerRadius(6)
                        }
                    }
                } else {
                    Text("x\(item.quantity)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
            
            if editable {
                Button(action: { onRemove?() }) {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundColor(.red.opacity(0.7))
                }
                .frame(width: 30)
            }
        }
        .padding(.vertical, 8)
        .contextMenu {
            if editable, let vm = cartVM, let idx = index {
                // Change seat submenu
                if vm.guestCount > 0 {
                    Menu {
                        ForEach(1...vm.guestCount, id: \.self) { seatNum in
                            Button {
                                vm.changeSeat(at: idx, to: "A\(seatNum)")
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
                            vm.changeSeat(at: idx, to: "C")
                        } label: {
                            HStack {
                                Text("Compartido")
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
                    ForEach(1...4, id: \.self) { courseNum in
                        Button {
                            vm.changeCourse(at: idx, to: courseNum)
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
                    onRemove?()
                } label: {
                    Label("Eliminar", systemImage: "trash")
                }
            }
        }
    }
}

// MARK: - Seat Picker

struct SeatPicker: View {
    let seats: [String]
    @Binding var activeSeat: String
    @Binding var activeCourse: Int
    
    var body: some View {
        VStack(spacing: 8) {
            // Seats
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(seats, id: \.self) { seat in
                        Button(action: { activeSeat = seat }) {
                            Text(seat == "C" ? "Todos" : seat)
                                .font(.caption.weight(.medium))
                                .foregroundColor(activeSeat == seat ? .white : .gray)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(activeSeat == seat ? Color.blue : Color.white.opacity(0.06))
                                .cornerRadius(16)
                        }
                    }
                }
            }
            
            // Courses (tiempos)
            HStack(spacing: 6) {
                ForEach(1...4, id: \.self) { course in
                    Button(action: { activeCourse = course }) {
                        Text("T\(course)")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(activeCourse == course ? .white : .gray)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(activeCourse == course ? Color.orange.opacity(0.7) : Color.white.opacity(0.04))
                            .cornerRadius(12)
                    }
                }
                Spacer()
            }
        }
    }
}
