import SwiftUI

/// Corrige los datos de pago de una orden YA PAGADA desde el historial de caja:
/// método de pago general, monto de propina y método de propina. El backend
/// recalcula el total y todo lo que depende (corte, efectivo esperado,
/// comisiones). No aplica a pagos divididos ni pedidos web/plataforma.
struct EditOrderPaymentSheet: View {
    @ObservedObject var vm: CashRegisterViewModel
    let order: Order
    /// Se llama tras guardar con éxito (p.ej. para cerrar la hoja de detalle).
    var onSaved: () -> Void = {}
    @Environment(\.dismiss) private var dismiss

    static func isEditable(_ order: Order) -> Bool {
        !order.isSplitPayment
            && order.source != "web"
            && order.paymentMethod != "online"
            && order.paymentMethod != "platform_delivery"
    }

    private let methods: [(String, String)] = [
        ("cash", "Efectivo"),
        ("terminal_mercadopago", "Terminal"),
        ("card", "Tarjeta"),
        ("transfer", "Transferencia"),
    ]

    @State private var paymentMethod = "cash"
    @State private var tipText = "0"
    @State private var tipMethod = "cash"
    @State private var saving = false

    private var subtotal: Double { Double(order.subtotal ?? "0") ?? 0 }
    private var tipValue: Double { Double(tipText.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var newTotal: Double { subtotal + max(0, tipValue) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Subtotal", value: vm.formatCurrency(String(subtotal)))
                    LabeledContent("Total nuevo") {
                        Text(vm.formatCurrency(String(newTotal))).bold()
                    }
                }

                Section("Método de pago") {
                    Picker("Método de pago", selection: $paymentMethod) {
                        ForEach(methods, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Propina") {
                    HStack {
                        Text("Monto")
                        Spacer()
                        TextField("0", text: $tipText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 120)
                    }
                    if tipValue > 0 {
                        Picker("Método de la propina", selection: $tipMethod) {
                            ForEach(methods, id: \.0) { Text($0.1).tag($0.0) }
                        }
                    }
                }
            }
            .navigationTitle("Editar pago · #\(order.orderNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Guardando…" : "Guardar") { save() }
                        .disabled(saving || tipValue < 0)
                }
            }
            .onAppear {
                paymentMethod = order.paymentMethod ?? "cash"
                tipText = String(Double(order.tip ?? "0") ?? 0)
                tipMethod = order.tipPaymentMethod ?? order.paymentMethod ?? "cash"
            }
        }
        .preferredColorScheme(.dark)
    }

    private func save() {
        saving = true
        Task {
            let ok = await vm.updateOrderPaymentDetails(
                orderId: order.id,
                paymentMethod: paymentMethod,
                tip: max(0, tipValue),
                tipPaymentMethod: tipValue > 0 ? tipMethod : paymentMethod
            )
            saving = false
            if ok {
                dismiss()
                onSaved()
            }
        }
    }
}
