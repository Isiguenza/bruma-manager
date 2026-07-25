import SwiftUI

struct NotesSheet: View {
    let productName: String
    @ObservedObject var menuVM: MenuViewModel
    let onConfirm: () -> Void
    let onSkip: () -> Void

    private var applicableQuickNotes: [QuickNote] {
        menuVM.applicableQuickNotes(forProductId: menuVM.pendingCartItem?.productId)
    }

    var body: some View {
        ZStack {
            Color(red: 0.08, green: 0.08, blue: 0.08).ignoresSafeArea()

            VStack(spacing: 16) {
                Text(productName)
                    .font(.headline)
                    .foregroundColor(.white)

                Text("¿Algún comentario?")
                    .font(.subheadline)
                    .foregroundColor(.gray)

                if !applicableQuickNotes.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(applicableQuickNotes) { note in
                                let isSelected = menuVM.selectedQuickNoteIds.contains(note.id)
                                Button {
                                    if isSelected {
                                        menuVM.selectedQuickNoteIds.remove(note.id)
                                    } else {
                                        menuVM.selectedQuickNoteIds.insert(note.id)
                                    }
                                } label: {
                                    Text(note.label)
                                        .font(.subheadline.weight(.medium))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(
                                            Capsule().fill(isSelected ? Color.blue : Color.white.opacity(0.1))
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2)
                    }
                }

                Button {
                    withAnimation { menuVM.showFreeTextNotes.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: menuVM.showFreeTextNotes ? "minus.circle" : "plus.circle")
                        Text("Comentario adicional")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)

                if menuVM.showFreeTextNotes {
                    TextField("Ej: sin cebolla, extra salsa...", text: $menuVM.tempNotes)
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(Color.white.opacity(0.08))
                        .cornerRadius(10)
                }

                HStack(spacing: 12) {
                    if #available(iOS 26.0, *) {
                        Button(action: onSkip) {
                            Text("Sin comentario")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.glass)
                    } else {
                        Button(action: onSkip) {
                            Text("Sin comentario")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(.ultraThinMaterial)
                                .cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                    }

                    if #available(iOS 26.0, *) {
                        Button(action: onConfirm) {
                            Text("Agregar")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.glassProminent)
                        .tint(.blue)
                    } else {
                        Button(action: onConfirm) {
                            Text("Agregar")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.blue)
                                .cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(20)
        }
    }
}
