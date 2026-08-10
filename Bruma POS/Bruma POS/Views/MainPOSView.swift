import SwiftUI

struct MainPOSView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            HStack(spacing: 12) {
                // Left side: Cart sidebar (2 internal cards)
                CartView(vm: vm)
                    .frame(width: 320)
                
                // Right side: Payment OR Categories+Products cards
                if vm.showingPayment {
                    PaymentView(vm: vm)
                        .frame(maxWidth: .infinity)
                        .background(Color(uiColor: .systemGray6).opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                     
                        .padding(.trailing, 12)
                        .padding(.vertical, 12)
                } else {
                    HStack(spacing: 12) {
                        // Category sidebar card
                        CategorySidebarView(vm: vm)
                            .frame(width: 220)
                            .background(Color(uiColor: .systemGray6).opacity(0.4))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                          
                        
                        // Product area card
                        ProductGridView(vm: vm)
                            .frame(maxWidth: .infinity)
                            .background(Color(uiColor: .systemGray6).opacity(0.4))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                       
                            .padding(.trailing, 12)
                    }
                    .padding(.vertical, 12)
                }
            }
            
            // MARK: - Cobro pendiente (chip flotante para reanudar)

            if vm.currentTableHasParkedPayment, let table = vm.selectedTable {
                VStack {
                    Spacer()
                    Button {
                        vm.resumeParkedPaymentForCurrentTable()
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "banknote.fill")
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Cobro pendiente · Mesa \(table.number)")
                                    .font(.subheadline.weight(.bold))
                                if let p = vm.parkedPayments[table.id] {
                                    Text("Recibido \(vm.formatCurrency(Double(p.cashReceived) ?? 0)) · Cambio \(vm.formatCurrency(p.changeSnapshot))")
                                        .font(.caption2)
                                        .foregroundColor(.white.opacity(0.85))
                                }
                            }
                            Spacer()
                            Text("Reanudar").font(.caption.weight(.bold))
                            Image(systemName: "chevron.up")
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color.green)
                        .clipShape(Capsule())
                        .shadow(radius: 8)
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 344)
                    .padding(.trailing, 24)
                    .padding(.bottom, 16)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // MARK: - Dialog Overlays

            if vm.showVariantDialog || vm.showNotesDialog {
                dialogOverlay {
                    ProductAddDialog(vm: vm)
                        .id(vm.selectedProductForVariant?.id ?? vm.pendingCartItem?.id.uuidString ?? "")
                }
            }
            
            if vm.showGuestCountDialog {
                dialogOverlay(onDismiss: { vm.showGuestCountDialog = false }) {
                    GuestCountDialog(vm: vm, isInitial: false)
                }
            }
            
            if vm.showInitialGuestDialog {
                dialogOverlay(onDismiss: { vm.showInitialGuestDialog = false }) {
                    GuestCountDialog(vm: vm, isInitial: true)
                }
            }
            
            if vm.showVoidDialog {
                dialogOverlay { VoidDialog(vm: vm) }
            }
            
            if vm.qrDialogOpen {
                dialogOverlay { LoyaltyDialog(vm: vm) }
            }
            
            if vm.manualStampDialogOpen {
                dialogOverlay { ManualStampDialog(vm: vm) }
            }
            
            if vm.showLoyaltyEmailDialog {
                dialogOverlay(onDismiss: { vm.showLoyaltyEmailDialog = false }) {
                    LoyaltyEmailDialog(vm: vm)
                }
            }
            
            if vm.showLoyaltyRewardDialog {
                dialogOverlay(onDismiss: {
                    vm.showLoyaltyRewardDialog = false
                    vm.loyaltyRewardMode = ""
                }) {
                    if vm.loyaltyRewardMode == "product" {
                        LoyaltyRewardProductPicker(vm: vm)
                    } else if vm.loyaltyRewardMode == "discount" {
                        LoyaltyRewardDiscountDialog(vm: vm)
                    } else {
                        LoyaltyRewardDialog(vm: vm)
                    }
                }
            }
            
            if vm.showFlexibleDiscountDialog {
                dialogOverlay { FlexibleDiscountDialog(vm: vm) }
            }
            
            if vm.showAdminMenu {
                dialogOverlay(onDismiss: { vm.showAdminMenu = false }) {
                    AdminMenuDialog(vm: vm)
                }
            }
            
            if vm.showTransferTableDialog {
                dialogOverlay { TransferTableDialog(vm: vm) }
            }
            
            if vm.showChangeItemDialog {
                Color.black.opacity(0.6)
                    .ignoresSafeArea()
                    .onTapGesture { vm.cancelChangeItem() }
                
                ChangeItemModal(vm: vm)
                    .frame(maxWidth: 480)
                    .frame(maxHeight: 600)
                    .cornerRadius(16)
                    .shadow(color: .black.opacity(0.5), radius: 20)
                    .padding(.horizontal, 32)
            }
            
            // MARK: - Split Payment Modal
            let splitTotalPaid = vm.splitPayments.reduce(0) { $0 + $1.amount }
            let splitRemaining = max(0, vm.totalWithTip - splitTotalPaid)
            
            if vm.showAddSplitPayment {
                dialogOverlay(onDismiss: { vm.showAddSplitPayment = false }) {
                    SplitPaymentModal(
                        vm: vm,
                        title: "Nuevo Pago",
                        initialAmount: String(format: "%.2f", splitRemaining),
                        maxAmount: splitRemaining,
                        onDismiss: { vm.showAddSplitPayment = false },
                        onConfirm: { payment in
                            vm.splitPayments.append(payment)
                            vm.showAddSplitPayment = false
                        }
                    )
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            if let payment = vm.editingSplitPayment {
                dialogOverlay(onDismiss: { vm.editingSplitPayment = nil }) {
                    SplitPaymentModal(
                        vm: vm,
                        title: "Editar Pago",
                        initialAmount: String(format: "%.2f", payment.amount),
                        initialTip: String(format: "%.2f", payment.tip),
                        initialMethod: payment.paymentMethod,
                        initialTipMethod: payment.tipPaymentMethod,
                        maxAmount: splitRemaining + payment.amount,
                        deleteAction: {
                            vm.splitPayments.removeAll { $0.id == payment.id }
                            vm.editingSplitPayment = nil
                        },
                        onDismiss: { vm.editingSplitPayment = nil },
                        onConfirm: { updated in
                            if let index = vm.splitPayments.firstIndex(where: { $0.id == payment.id }) {
                                vm.splitPayments[index] = updated
                            }
                            vm.editingSplitPayment = nil
                        }
                    )
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
                }
            }
            
            // MARK: - Toast
            
            if let toast = vm.toastMessage {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Image(systemName: vm.toastIsError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                            .foregroundColor(vm.toastIsError ? .red : .green)
                        Text(toast)
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .background(
                        Capsule()
                            .fill(Color(white: 0.15))
                            .shadow(color: .black.opacity(0.4), radius: 10)
                    )
                    .padding(.bottom, 30)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .animation(.spring(), value: vm.toastMessage)
            }
        }
        .sheet(isPresented: $vm.showLocationModal) {
            OrderLocationModal(vm: vm)
        }
    }

    @ViewBuilder
    private func dialogOverlay<Content: View>(onDismiss: @escaping () -> Void = {}, @ViewBuilder content: () -> Content) -> some View {
        ZStack {
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }
            
            content()
                .contentShape(Rectangle())
                .onTapGesture {}
        }
    }
}
