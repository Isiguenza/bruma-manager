import SwiftUI

/// Hoja de notas equivalente a `ProductAddDialog` de Bruma POS. Se mantiene
/// montada para conservar la animación de entrada del `BottomSheetCard`.
struct ComandasProductAddDialog: View {
    @ObservedObject var vm: POSViewModel

    private var productName: String {
        vm.pendingCartItem?.productName ?? vm.selectedProductForVariant?.name ?? ""
    }

    var body: some View {
        BottomSheetCard(onDismiss: vm.handleCancelNotes) {
            VStack(spacing: 20) {
                Text(productName)
                    .font(.title3.bold())
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)

                notesSection
                .transition(.asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .move(edge: .top).combined(with: .opacity)
                ))
            }
        }
    }

    @ViewBuilder
    private var notesSection: some View {
        VStack(spacing: 16) {
            let flowItems = vm.flowSummaryItems()
            if !flowItems.isEmpty {
                MobileFlowNotesSummary(
                    items: flowItems,
                    formatCurrency: vm.formatCurrency,
                    editSelection: {
                        Haptics.tap()
                        vm.handleCancelNotes()
                    }
                )
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Comentarios especiales").font(.subheadline.bold()).foregroundColor(.white)
                Text("Instrucciones, preferencias o alergias").font(.caption).foregroundColor(.gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if !applicableQuickNotes.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(applicableQuickNotes) { note in
                            let isSelected = vm.selectedQuickNoteIds.contains(note.id)
                            Button {
                                Haptics.tap()
                                if isSelected {
                                    vm.selectedQuickNoteIds.remove(note.id)
                                } else {
                                    vm.selectedQuickNoteIds.insert(note.id)
                                }
                            } label: {
                                Text(note.label)
                                    .font(.subheadline.weight(.medium))
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .modifier(FlatPill(isSelected: isSelected, color: .blue))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    vm.showFreeTextNotes.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: vm.showFreeTextNotes ? "minus.circle" : "plus.circle")
                    Text("Comentario adicional")
                }
                .font(.subheadline.weight(.medium))
                .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)

            if vm.showFreeTextNotes {
                ZStack(alignment: .topLeading) {
                    if vm.tempNotes.isEmpty {
                        Text("Ej: Sin cebolla, extra salsa...")
                            .foregroundColor(.gray.opacity(0.5))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                    }
                    TextEditor(text: $vm.tempNotes)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .padding(12)
                        .frame(height: 100)
                }
                .modifier(FlatCard(cornerRadius: 12))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack(spacing: 12) {
                Button {
                    Haptics.tap()
                    vm.handleCancelNotes()
                } label: {
                    Text("Cancelar").font(.headline).frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(.flatCapsuleNeutral)

                Button {
                    Haptics.tap()
                    vm.handleConfirmNotes()
                } label: {
                    let hasContent = !vm.selectedQuickNoteIds.isEmpty || !vm.tempNotes.trimmingCharacters(in: .whitespaces).isEmpty
                    Text(hasContent ? "Confirmar" : "Agregar").font(.headline).frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(.flatCapsule(.blue))
            }
        }
    }

    private var currentProductId: String? {
        vm.pendingCartItem?.productId ?? vm.selectedProduct?.id
    }

    private var applicableQuickNotes: [QuickNote] {
        vm.quickNotes.filter { $0.applies(toProductId: currentProductId, variantName: vm.pendingCartItem?.variantName) }
    }

}

/// Resumen completo del paquete antes de agregarlo al carrito en iPhone.
private struct MobileFlowNotesSummary: View {
    let items: [CartItem]
    let formatCurrency: (Double) -> String
    let editSelection: () -> Void

    private var total: Double { items.reduce(0) { $0 + $1.total } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Resumen del paquete")
                .font(.subheadline.bold())
                .foregroundColor(.white)

            ForEach(items) { item in
                HStack(spacing: 8) {
                    if item.parentLocalId != nil {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    Text(item.productName)
                        .font(item.parentLocalId == nil ? .subheadline.weight(.semibold) : .caption)
                        .foregroundColor(.white)
                    Spacer(minLength: 12)
                    Text(formatCurrency(item.unitPrice))
                        .font(.caption.weight(.medium))
                        .foregroundColor(item.parentLocalId == nil ? .green : .gray)
                }
                .padding(.leading, item.parentLocalId == nil ? 0 : 14)
            }

            Divider().background(Color.white.opacity(0.12))
            HStack {
                Text("Total").font(.subheadline.weight(.bold)).foregroundColor(.white)
                Spacer()
                Text(formatCurrency(total)).font(.subheadline.weight(.bold)).foregroundColor(.green)
            }

            Button(action: editSelection) {
                Label("Editar selección", systemImage: "chevron.left")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
            }
            .buttonStyle(.flatCapsuleNeutral)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .modifier(FlatCard(cornerRadius: 12))
    }
}
