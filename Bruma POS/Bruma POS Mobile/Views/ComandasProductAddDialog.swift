import SwiftUI

/// Misma hoja combinada variante/notas que `ProductAddDialog` de Bruma POS
/// (`Views/DialogViews.swift`, no compartido — reescrito aquí porque vive en
/// un archivo de Views que se queda exclusivo de POS). Mismo modelo de
/// interacción: un solo `BottomSheetCard` que cambia de contenido según
/// `vm.showVariantDialog`/`vm.showNotesDialog`, nunca se desmonta entre los
/// dos modos (por eso la animación de transición se ve bien la primera vez
/// que se abre, no solo las siguientes).
struct ComandasProductAddDialog: View {
    @ObservedObject var vm: POSViewModel
    @State private var mode: Mode

    enum Mode { case variants, notes }

    init(vm: POSViewModel) {
        self.vm = vm
        self._mode = State(initialValue: vm.showVariantDialog ? .variants : .notes)
    }

    private var productName: String {
        vm.pendingCartItem?.productName ?? vm.selectedProductForVariant?.name ?? ""
    }

    var body: some View {
        BottomSheetCard(onDismiss: {
            if vm.showNotesDialog {
                vm.handleCancelNotes()
            } else {
                vm.dismissVariantDialog()
            }
        }) {
            VStack(spacing: 20) {
                Text(productName)
                    .font(.title3.bold())
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)

                Group {
                    if mode == .variants {
                        variantsSection
                    } else {
                        notesSection
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .move(edge: .top).combined(with: .opacity)
                ))
            }
        }
        .onChange(of: vm.showNotesDialog) { _, newValue in
            if newValue {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.72)) { mode = .notes }
            }
        }
        .onChange(of: vm.showVariantDialog) { _, newValue in
            if newValue { mode = .variants }
        }
    }

    @ViewBuilder
    private var variantsSection: some View {
        VStack(spacing: 12) {
            Text("Selecciona una opción:")
                .font(.subheadline)
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let product = vm.selectedProductForVariant {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(product.parsedVariants) { variant in
                        let isPlatform = vm.isPlatformDelivery
                        let price = isPlatform ? variant.numericPlatformPrice : variant.numericPrice

                        Button {
                            Haptics.tap()
                            vm.handleAddVariant(variant.name, price: variant.price, platformPrice: variant.platformPrice)
                        } label: {
                            VStack(spacing: 8) {
                                Text(variant.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                Text(vm.formatCurrency(price))
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 10)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 92)
                            .modifier(FlatCard(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Button {
                Haptics.tap()
                vm.dismissVariantDialog()
            } label: {
                Text("Cancelar").font(.headline).frame(maxWidth: .infinity).frame(height: 48)
            }
            .buttonStyle(.flatCapsuleNeutral)
        }
    }

    @ViewBuilder
    private var notesSection: some View {
        VStack(spacing: 16) {
            if let flow = vm.categoryFlow {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Resumen de selección")
                        .font(.subheadline.bold())
                        .foregroundColor(.white)
                    ForEach(flow.steps) { step in
                        if let sel = vm.stepSelections[step.id] {
                            HStack(alignment: .top, spacing: 6) {
                                Text("•").foregroundColor(.blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(step.stepName).font(.caption.weight(.medium)).foregroundColor(.white)
                                    Text(selectionSummary(for: sel)).font(.caption).foregroundColor(.gray)
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .modifier(FlatCard(cornerRadius: 12))
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

    private func selectionSummary(for selection: Any) -> String {
        if let opts = selection as? [ModifierOption], !opts.isEmpty {
            return opts.map { $0.name }.joined(separator: ", ")
        } else if let opt = selection as? ModifierOption {
            return opt.name
        } else if let exts = selection as? [Extra], !exts.isEmpty {
            return exts.map { $0.name }.joined(separator: ", ")
        } else if let f = selection as? Frosting {
            return f.name
        } else if let t = selection as? DryTopping {
            return t.name
        }
        return ""
    }
}
