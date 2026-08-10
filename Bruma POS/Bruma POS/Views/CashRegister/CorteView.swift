import SwiftUI

struct CorteView: View {
    @StateObject var vm = CorteViewModel()
    let registerId: String
    let register: CashRegister
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if vm.loading {
                ProgressView("Cargando corte...")
                    .tint(.white)
                    .foregroundColor(.white)
            } else if let data = vm.corteData {
                ScrollView {
                    VStack(spacing: 20) {
                        // Header
                        headerSection(data)
                        
                        // Ventas
                        ventasSection(data)
                        
                        // Propinas
                        propinasSection(data)
                        
                        // Comisiones
                        comisionesSection(data)

                        // Comisión de pedidos en línea (Stripe)
                        if data.sales.online > 0 {
                            comisionesOnlineSection(data)
                        }

                        // Movimientos de caja
                        movimientosSection(data)
                        
                        // Resumen final
                        resumenSection(data)
                        
                        // Acciones
                        actionsSection
                        
                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                }
            } else if let error = vm.error {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundColor(.orange)
                    Text(error)
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                    Button("Reintentar") {
                        Task { await vm.loadCorte(registerId: registerId) }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .onAppear {
            Task { await vm.loadCorte(registerId: registerId) }
        }
        .preferredColorScheme(.dark)
    }
    
    // MARK: - Sections
    
    private func headerSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Corte Financiero")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                Spacer()
                Text(data.register.status == "open" ? "En curso" : "Cerrado")
                    .font(.caption.bold())
                    .foregroundColor(data.register.status == "open" ? .green : .gray)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background((data.register.status == "open" ? Color.green : Color.gray).opacity(0.2))
                    .cornerRadius(6)
            }
            
            HStack {
                Image(systemName: "calendar")
                    .foregroundColor(.gray)
                Text(formatDate(data.register.openedAt))
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }
    
    private func ventasSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Ventas", icon: "chart.bar.fill", color: .blue)
            
            VStack(spacing: 10) {
                paymentRow(
                    method: "Efectivo",
                    amount: data.sales.cash,
                    count: data.summary.cashOrders,
                    color: .green
                )
                paymentRow(
                    method: "Tarjeta",
                    amount: data.sales.card,
                    netAmount: data.sales.netCard,
                    count: data.summary.cardOrders,
                    color: .blue,
                    showNet: true
                )
                paymentRow(
                    method: "Transferencia",
                    amount: data.sales.transfer,
                    count: data.summary.transferOrders,
                    color: .purple
                )
                if data.sales.online > 0 {
                    paymentRow(
                        method: "Online",
                        amount: data.sales.online,
                        netAmount: data.sales.netOnline,
                        count: data.summary.onlineOrders,
                        color: .teal,
                        showNet: true
                    )
                }

                if data.sales.platformDelivery > 0 {
                    paymentRow(
                        method: "Plataformas",
                        amount: data.sales.platformDelivery,
                        color: .orange
                    )
                }
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Total Bruto")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Text(vm.formatCurrency(data.sales.total))
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                
                HStack {
                    Text("Total Neto")
                        .font(.subheadline.bold())
                        .foregroundColor(.green)
                    Spacer()
                    Text(vm.formatCurrency(vm.totalNetSales))
                        .font(.subheadline.bold())
                        .foregroundColor(.green)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }
    
    private func propinasSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Propinas", icon: "heart.fill", color: .pink)
            
            VStack(spacing: 10) {
                tipRow(method: "Efectivo", amount: data.tips.cash, color: .green)
                tipRow(method: "Tarjeta", amount: data.tips.card, netAmount: data.tips.netCard, color: .blue, showNet: true)
                tipRow(method: "Transferencia", amount: data.tips.transfer, color: .purple)
                if data.tips.online > 0 {
                    tipRow(method: "Online", amount: data.tips.online, netAmount: data.tips.netOnline, color: .teal, showNet: true)
                }

                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Total Bruto")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Text(vm.formatCurrency(data.tips.total))
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                
                HStack {
                    Text("Total Neto")
                        .font(.subheadline.bold())
                        .foregroundColor(.green)
                    Spacer()
                    Text(vm.formatCurrency(vm.totalNetTips))
                        .font(.subheadline.bold())
                        .foregroundColor(.green)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }
    
    private func comisionesSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Comisiones Bancarias", icon: "creditcard.fill", color: .orange)
            
            VStack(spacing: 10) {
                HStack {
                    Text("Tasa aplicada")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text(vm.formatPercentage(data.commissions.rateWithIVA))
                        .font(.subheadline)
                        .foregroundColor(.orange)
                }
                
                detailRow(label: "Comisión por ventas", value: data.commissions.salesCommission, color: .white)
                detailRow(label: "Comisión por propinas", value: data.commissions.tipsCommission, color: .white)
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Total comisiones")
                        .font(.subheadline.bold())
                        .foregroundColor(.orange)
                    Spacer()
                    Text("-\(vm.formatCurrency(data.commissions.total))")
                        .font(.subheadline.bold())
                        .foregroundColor(.orange)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }

    /// Comisión de pedidos en línea (Stripe): 3.6% + $3 MXN por transacción,
    /// +IVA. Distinta de la comisión de terminal — se muestra aparte.
    private func comisionesOnlineSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Comisión Pedidos en Línea", icon: "globe", color: .teal)

            VStack(spacing: 10) {
                HStack {
                    Text("Tasa aplicada")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(vm.formatPercentage(data.commissions.online.rateWithIVA)) + \(vm.formatCurrency(data.commissions.online.fixedFeeWithIVA))/transacción")
                        .font(.subheadline)
                        .foregroundColor(.teal)
                }

                detailRow(label: "Comisión por ventas", value: data.commissions.online.salesCommission, color: .white)
                detailRow(label: "Comisión por propinas", value: data.commissions.online.tipsCommission, color: .white)

                Divider().background(Color.white.opacity(0.1))

                HStack {
                    Text("Total comisión online")
                        .font(.subheadline.bold())
                        .foregroundColor(.teal)
                    Spacer()
                    Text("-\(vm.formatCurrency(data.commissions.online.total))")
                        .font(.subheadline.bold())
                        .foregroundColor(.teal)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }

    private func movimientosSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Movimientos de Caja", icon: "arrow.left.arrow.right", color: .cyan)
            
            VStack(spacing: 10) {
                HStack {
                    Image(systemName: "arrow.down")
                        .foregroundColor(.green)
                    Text("Depósitos")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(data.movements.deposits.count) mov.")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(vm.formatCurrency(data.movements.deposits.total))
                        .font(.subheadline.bold())
                        .foregroundColor(.green)
                }
                
                if !data.movements.deposits.items.isEmpty {
                    ForEach(data.movements.deposits.items) { item in
                        HStack {
                            Text(item.displayDate)
                                .font(.caption)
                                .foregroundColor(.gray)
                            Text(item.description ?? "Depósito")
                                .font(.caption)
                                .foregroundColor(.gray)
                                .lineLimit(1)
                            Spacer()
                            Text(vm.formatCurrency(item.amount))
                                .font(.caption)
                                .foregroundColor(.green)
                        }
                        .padding(.leading, 24)
                    }
                }
                
                HStack {
                    Image(systemName: "arrow.up")
                        .foregroundColor(.red)
                    Text("Sangrías")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(data.movements.withdrawals.count) mov.")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(vm.formatCurrency(data.movements.withdrawals.total))
                        .font(.subheadline.bold())
                        .foregroundColor(.red)
                }
                
                if !data.movements.withdrawals.items.isEmpty {
                    ForEach(data.movements.withdrawals.items) { item in
                        HStack {
                            Text(item.displayDate)
                                .font(.caption)
                                .foregroundColor(.gray)
                            Text(item.description ?? "Sangría")
                                .font(.caption)
                                .foregroundColor(.gray)
                                .lineLimit(1)
                            Spacer()
                            Text("-\(vm.formatCurrency(item.amount))")
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                        .padding(.leading, 24)
                    }
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }
    
    private func resumenSection(_ data: CorteData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Resumen Final", icon: "checkmark.seal.fill", color: .green)
            
            VStack(spacing: 10) {
                detailRow(label: "Ventas efectivo", value: data.sales.cash + data.tips.cash, color: .white)
                detailRow(label: "Depósitos", value: data.movements.deposits.total, color: .green)
                detailRow(label: "Sangrías", value: -data.movements.withdrawals.total, color: .red)
                detailRow(label: "Fondo inicial", value: data.register.initialCash, color: .white)
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Efectivo esperado")
                        .font(.subheadline.bold())
                        .foregroundColor(.yellow)
                    Spacer()
                    Text(vm.formatCurrency(vm.cashExpected))
                        .font(.subheadline.bold())
                        .foregroundColor(.yellow)
                }
                
                if let finalCash = data.summary.finalCash {
                    HStack {
                        Text("Efectivo contado")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        Spacer()
                        Text(vm.formatCurrency(finalCash))
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    
                    HStack {
                        Text("Diferencia")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        Spacer()
                        let diff = vm.differenceAmount
                        Text(vm.formatCurrency(diff))
                            .font(.subheadline.bold())
                            .foregroundColor(diff >= 0 ? .green : .red)
                    }
                }
                
                Divider().background(Color.white.opacity(0.1))
                
                HStack {
                    Text("Total órdenes")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                    Spacer()
                    Text("\(data.summary.totalOrders)")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                }
                
                if data.summary.splitOrders > 0 {
                    HStack {
                        Text("Pagos divididos")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        Spacer()
                        Text("\(data.summary.splitOrders)")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                    }
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
    }
    
    private var actionsSection: some View {
        HStack(spacing: 12) {
            Button(action: {
                Task { await vm.printCorte() }
            }) {
                HStack {
                    Image(systemName: "printer.fill")
                    Text("Imprimir Corte")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            }
        }
    }
    
    // MARK: - Helpers
    
    private func sectionHeader(_ title: String, icon: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)
            Text(title)
                .font(.headline.bold())
                .foregroundColor(.white)
        }
    }
    
    private func paymentRow(method: String, amount: Double, netAmount: Double = 0, count: Int = 0, color: Color, showNet: Bool = false) -> some View {
        HStack {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(method)
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
            Spacer()
            if count > 0 {
                Text("\(count) ord.")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            if showNet && netAmount > 0 && netAmount != amount {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(vm.formatCurrency(amount))
                        .font(.subheadline)
                        .foregroundColor(.white)
                    Text("neto: \(vm.formatCurrency(netAmount))")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            } else {
                Text(vm.formatCurrency(amount))
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
        }
    }
    
    private func tipRow(method: String, amount: Double, netAmount: Double = 0, color: Color, showNet: Bool = false) -> some View {
        HStack {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(method)
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
            Spacer()
            if showNet && netAmount > 0 && netAmount != amount {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(vm.formatCurrency(amount))
                        .font(.subheadline)
                        .foregroundColor(.white)
                    Text("neto: \(vm.formatCurrency(netAmount))")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            } else {
                Text(vm.formatCurrency(amount))
                    .font(.subheadline)
                    .foregroundColor(.white)
            }
        }
    }
    
    private func detailRow(label: String, value: Double, color: Color) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.gray)
            Spacer()
            Text(vm.formatCurrency(value))
                .font(.subheadline)
                .foregroundColor(color)
        }
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: dateString) else { return dateString }
        let output = DateFormatter()
        output.dateFormat = "dd MMM yyyy, HH:mm"
        output.locale = Locale(identifier: "es-MX")
        return output.string(from: date)
    }
}
