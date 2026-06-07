import SwiftUI

// MARK: - Split Assign View

struct SplitAssignView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Text("Dividir Cuenta")
                    .font(.title.bold())
                    .foregroundColor(.white)
                Spacer()
                Button {
                    vm.paymentStep = "summary"
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Regresar")
                    }
                    .font(.subheadline.bold())
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(white: 0.1))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
            }
            
            // Person navigator
            HStack {
                Button {
                    vm.currentPersonIndex = max(0, vm.currentPersonIndex - 1)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Anterior")
                    }
                    .font(.subheadline.bold())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(white: 0.1))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .disabled(vm.currentPersonIndex == 0)
                .opacity(vm.currentPersonIndex == 0 ? 0.3 : 1)
                
                Spacer()
                
                VStack(spacing: 6) {
                    Text("Persona \(vm.currentPersonIndex + 1) de \(vm.guestCount)")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    HStack(spacing: 4) {
                        ForEach(0..<vm.guestCount, id: \.self) { idx in
                            Circle()
                                .fill(idx == vm.currentPersonIndex ? Color.blue : Color(white: 0.2))
                                .frame(width: 8, height: 8)
                        }
                    }
                }
                
                Spacer()
                
                Button {
                    vm.currentPersonIndex = min(vm.guestCount - 1, vm.currentPersonIndex + 1)
                } label: {
                    HStack(spacing: 4) {
                        Text("Siguiente")
                        Image(systemName: "chevron.right")
                    }
                    .font(.subheadline.bold())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(white: 0.1))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .disabled(vm.currentPersonIndex == vm.guestCount - 1)
                .opacity(vm.currentPersonIndex == vm.guestCount - 1 ? 0.3 : 1)
            }
            
            // Items list with checkboxes
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Persona \(vm.currentPersonIndex + 1)")
                        .font(.headline)
                        .foregroundColor(.white)
                    Spacer()
                    Text("\((vm.itemAssignments[vm.currentPersonIndex] ?? []).count) items asignados")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(Array(vm.cart.enumerated()), id: \.element.id) { cartIndex, item in
                            let assignedItems = vm.itemAssignments[vm.currentPersonIndex] ?? []
                            let isAssigned = assignedItems.contains(cartIndex)
                            let assignedToOthers = vm.itemAssignments
                                .filter { $0.key != vm.currentPersonIndex }
                                .flatMap { $0.value }
                            let isAssignedToOther = assignedToOthers.contains(cartIndex)
                            
                            Button {
                                guard !isAssignedToOther else { return }
                                if isAssigned {
                                    vm.itemAssignments[vm.currentPersonIndex]?.removeAll { $0 == cartIndex }
                                } else {
                                    vm.itemAssignments[vm.currentPersonIndex, default: []].append(cartIndex)
                                }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: isAssigned ? "checkmark.square.fill" : "square")
                                        .font(.title3)
                                        .foregroundColor(isAssigned ? .blue : .gray)
                                    
                                    Text("\(item.quantity)x \(item.productName)")
                                        .font(.subheadline)
                                        .foregroundColor(.white)
                                    
                                    if isAssignedToOther {
                                        Text("(asignado)")
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                    }
                                    
                                    Spacer()
                                    
                                    let itemTotal = item.unitPrice * Double(item.quantity) - (item.promotionDiscount ?? 0)
                                    Text(vm.formatCurrency(itemTotal))
                                        .font(.subheadline.bold())
                                        .foregroundColor(.blue)
                                }
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(isAssigned ? Color.blue.opacity(0.12) : Color(white: 0.06))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(isAssigned ? Color.blue.opacity(0.4) : Color(white: 0.12))
                                        )
                                )
                                .opacity(isAssignedToOther ? 0.4 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(isAssignedToOther)
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(white: 0.08))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.15)))
            )
            
            // Confirm button
            let totalAssigned = vm.itemAssignments.values.flatMap { $0 }.count
            let allAssigned = totalAssigned == vm.cart.count
            
            Button {
                vm.paymentStep = "split-overview"
            } label: {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                    Text(allAssigned ? "Confirmar División" : "Faltan \(vm.cart.count - totalAssigned) items por asignar")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(allAssigned ? Color.green : Color.gray.opacity(0.3))
                .foregroundColor(.white)
                .cornerRadius(14)
            }
            .disabled(!allAssigned)
        }
        .frame(maxWidth: 700)
        .padding(20)
    }
}

// MARK: - Split Overview View

struct SplitOverviewView: View {
    @ObservedObject var vm: POSViewModel
    
    private var totalPaid: Double {
        vm.individualPayments.values.reduce(0) { $0 + ($1.paid ? $1.amount : 0) }
    }
    
    private var remaining: Double {
        max(0, vm.cartTotal - totalPaid)
    }
    
    private var allPaid: Bool {
        !vm.individualPayments.isEmpty && vm.individualPayments.values.allSatisfy { $0.paid }
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Header
                HStack {
                    Text("Cobro Dividido")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Button {
                        vm.paymentStep = "split-assign"
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Editar División")
                        }
                        .font(.subheadline.bold())
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(white: 0.1))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                }
                
                // Totals
                HStack(spacing: 12) {
                    totalCard(title: "Total", amount: vm.cartTotal, color: .white)
                    totalCard(title: "Pagado", amount: totalPaid, color: .green)
                    totalCard(title: "Restante", amount: remaining, color: .yellow)
                }
                
                // Person list
                VStack(spacing: 8) {
                    ForEach(0..<vm.guestCount, id: \.self) { idx in
                        let payment = vm.individualPayments[idx]
                        let hasPaid = payment?.paid ?? false
                        let assignedItems = vm.itemAssignments[idx] ?? []
                        let personTotal = assignedItems.reduce(0.0) { sum, ci in
                            guard ci < vm.cart.count else { return sum }
                            return sum + vm.cart[ci].unitPrice * Double(vm.cart[ci].quantity)
                        }
                        
                        Button {
                            if !hasPaid {
                                vm.selectedSplitPersonIndex = idx
                                vm.splitPaymentMethod = nil
                                vm.splitCashReceived = ""
                                vm.paymentStep = "split-pay-person"
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: hasPaid ? "checkmark.circle.fill" : "person.crop.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(hasPaid ? .green : .blue)
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Persona \(idx + 1)")
                                        .font(.subheadline.bold())
                                        .foregroundColor(.white)
                                    Text("\(assignedItems.count) items")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                
                                Spacer()
                                
                                Text(vm.formatCurrency(hasPaid ? (payment?.amount ?? 0) : personTotal))
                                    .font(.headline)
                                    .foregroundColor(hasPaid ? .green : .white)
                                
                                Text(hasPaid ? "Pagado" : "Pendiente")
                                    .font(.caption.bold())
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(hasPaid ? Color.green : Color.yellow)
                                    .foregroundColor(hasPaid ? .white : .black)
                                    .cornerRadius(6)
                            }
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(hasPaid ? Color.green.opacity(0.06) : Color(white: 0.08))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(hasPaid ? Color.green.opacity(0.2) : Color(white: 0.15))
                                    )
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(hasPaid)
                    }
                }
                
                // All paid
                if allPaid {
                    VStack(spacing: 16) {
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 36))
                                .foregroundColor(.green)
                            VStack(alignment: .leading) {
                                Text("Todos han pagado")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                Text("Total: \(vm.formatCurrency(totalPaid))")
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                        }
                        .padding(16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.green.opacity(0.1))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.green.opacity(0.3)))
                        )
                        
                        SlideToConfirmView {
                            vm.handleFinalizeSplitBill()
                        }
                        .disabled(vm.confirmingOrder)
                    }
                }
                
                // Continue order button
                Button {
                    vm.showingPayment = false
                    vm.paymentStep = "summary"
                    vm.showToast("Puedes añadir más productos. Presiona Cobrar para continuar.")
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Continuar Orden")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                
                // Cancel
                Button {
                    vm.paymentStep = "summary"
                } label: {
                    Text("Cancelar Cobro")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color(white: 0.08))
                        .foregroundColor(.gray)
                        .cornerRadius(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.15)))
                }
            }
            .frame(maxWidth: 500)
            .padding(20)
        }
    }
    
    private func totalCard(title: String, amount: Double, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
            Text(vm.formatCurrency(amount))
                .font(.headline)
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(white: 0.08))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.15)))
        )
    }
}

// MARK: - Split Pay Person View

struct SplitPayPersonView: View {
    @ObservedObject var vm: POSViewModel
    
    private var pIdx: Int { vm.selectedSplitPersonIndex }
    
    private var assignedItems: [Int] {
        vm.itemAssignments[pIdx] ?? []
    }
    
    private var personTotal: Double {
        assignedItems.reduce(0.0) { sum, ci in
            guard ci < vm.cart.count else { return sum }
            return sum + vm.cart[ci].unitPrice * Double(vm.cart[ci].quantity)
        }
    }
    
    private var tipData: IndividualTip {
        vm.individualTips[pIdx] ?? IndividualTip()
    }
    
    private var tipAmt: Double {
        tipData.showCustom ? (Double(tipData.custom) ?? 0) : personTotal * Double(tipData.percentage) / 100
    }
    
    private var finalTotal: Double { personTotal + tipAmt }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Header
                HStack {
                    Text("Persona \(pIdx + 1)")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Button {
                        vm.paymentStep = "split-overview"
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Regresar")
                        }
                        .font(.subheadline.bold())
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(white: 0.1))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                }
                
                // Assigned items
                VStack(alignment: .leading, spacing: 8) {
                    Text("Productos")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    ForEach(assignedItems, id: \.self) { ci in
                        if ci < vm.cart.count {
                            let item = vm.cart[ci]
                            HStack {
                                Text("\(item.quantity)x \(item.productName)")
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                                Spacer()
                                Text(vm.formatCurrency(item.unitPrice * Double(item.quantity)))
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.15)))
                )
                
                // Tip
                VStack(alignment: .leading, spacing: 8) {
                    Text("Propina")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    
                    HStack(spacing: 8) {
                        ForEach([0, 10, 15, 20], id: \.self) { pct in
                            Button {
                                vm.individualTips[pIdx] = IndividualTip(percentage: pct, custom: "", showCustom: false)
                            } label: {
                                Text(pct == 0 ? "Sin" : "\(pct)%")
                                    .font(.subheadline.bold())
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 40)
                                    .background(tipData.percentage == pct && !tipData.showCustom ? Color.blue : Color(white: 0.12))
                                    .foregroundColor(.white)
                                    .cornerRadius(8)
                            }
                        }
                        
                        Button {
                            vm.individualTips[pIdx] = IndividualTip(percentage: 0, custom: "", showCustom: true)
                        } label: {
                            Text("Otro")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .frame(height: 40)
                                .background(tipData.showCustom ? Color.blue : Color(white: 0.12))
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                    }
                    
                    if tipData.showCustom {
                        TextField("0.00", text: Binding(
                            get: { tipData.custom },
                            set: { vm.individualTips[pIdx]?.custom = $0 }
                        ))
                        .keyboardType(.decimalPad)
                        .font(.title3.bold())
                        .foregroundColor(.white)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color(white: 0.06))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(white: 0.2)))
                        )
                    }
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.15)))
                )
                
                // Totals
                VStack(spacing: 8) {
                    HStack {
                        Text("Subtotal:")
                            .foregroundColor(.gray)
                        Spacer()
                        Text(vm.formatCurrency(personTotal))
                            .font(.subheadline.bold())
                            .foregroundColor(.gray)
                    }
                    if tipAmt > 0 {
                        HStack {
                            Text("Propina:")
                                .foregroundColor(.blue)
                            Spacer()
                            Text(vm.formatCurrency(tipAmt))
                                .font(.subheadline.bold())
                                .foregroundColor(.blue)
                        }
                    }
                    Divider().background(Color(white: 0.2))
                    HStack {
                        Text("Total:")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Spacer()
                        Text(vm.formatCurrency(finalTotal))
                            .font(.title2.bold())
                            .foregroundColor(.white)
                    }
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.08))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.15)))
                )
                
                // Payment methods
                HStack(spacing: 12) {
                    splitPayMethodCard(method: "cash", icon: "banknote.fill", label: "Efectivo", color: .green)
                    splitPayMethodCard(method: "terminal_mercadopago", icon: "creditcard.fill", label: "Terminal", color: .blue)
                    splitPayMethodCard(method: "transfer", icon: "building.columns.fill", label: "Transferencia", color: .purple)
                }
                
                // Cash input
                if vm.splitPaymentMethod == "cash" {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Efectivo recibido")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        TextField("0.00", text: $vm.splitCashReceived)
                            .keyboardType(.decimalPad)
                            .font(.largeTitle.bold())
                            .foregroundColor(.white)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(white: 0.06))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.2)))
                            )
                        
                        if let cash = Double(vm.splitCashReceived), cash > 0 {
                            HStack {
                                Text("Cambio")
                                    .foregroundColor(.white)
                                Spacer()
                                Text(vm.formatCurrency(max(0, cash - finalTotal)))
                                    .font(.title2.bold())
                                    .foregroundColor(cash >= finalTotal ? .green : .red)
                            }
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 10).fill(Color(white: 0.06)))
                        }
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(white: 0.08))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(white: 0.15)))
                    )
                }
                
                // Confirm slide
                if vm.splitPaymentMethod != nil && (vm.splitPaymentMethod != "cash" || (Double(vm.splitCashReceived) ?? 0) >= finalTotal) {
                    SlideToConfirmView {
                        vm.handleSplitPayPerson()
                    }
                }
            }
            .frame(maxWidth: 500)
            .padding(20)
        }
    }
    
    private func splitPayMethodCard(method: String, icon: String, label: String, color: Color) -> some View {
        Button {
            vm.splitPaymentMethod = method
        } label: {
            VStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(color)
                Text(label)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(white: 0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(vm.splitPaymentMethod == method ? color : Color(white: 0.15), lineWidth: vm.splitPaymentMethod == method ? 2 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
