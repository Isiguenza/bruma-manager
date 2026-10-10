import SwiftUI

/// One platillo of the package being composed that can carry its own comment.
struct NotesTarget: Identifiable, Equatable {
    /// Position inside the pending flow items; 0 is always the parent.
    let id: Int
    let name: String
    let isChild: Bool
    let hasNote: Bool
}

/// "¿Para cuál platillo es el comentario?" — shared by iPad and iPhone so a
/// package never again sends the drink's "sin hielos" under the main dish.
/// Hidden when there is only one platillo: nothing to choose, nothing to show.
struct NotesTargetPicker: View {
    let targets: [NotesTarget]
    let selectedId: Int
    let onSelect: (Int) -> Void

    @Namespace private var highlight
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if targets.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
                Text("¿Para cuál platillo?")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.gray)
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(targets) { target in
                                chip(target)
                                    .id(target.id)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .onChange(of: selectedId) { _, id in
                        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 1)) {
                            proxy.scrollTo(id, anchor: .center)
                        }
                    }
                }
            }
        }
    }

    private func chip(_ target: NotesTarget) -> some View {
        let selected = target.id == selectedId
        return Button {
            guard !selected else { return }
            Haptics.tap()
            // The highlight is not thrown by a gesture, so it settles without bounce.
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.3, dampingFraction: 1)) {
                onSelect(target.id)
            }
        } label: {
            HStack(spacing: 6) {
                if target.isChild {
                    Image(systemName: "arrow.turn.down.right")
                        .font(.caption2.weight(.semibold))
                        .opacity(0.7)
                }
                Text(target.name)
                    .font(.subheadline.weight(selected ? .semibold : .regular))
                    .lineLimit(1)
                if target.hasNote {
                    Circle()
                        .fill(selected ? Color.black.opacity(0.55) : Color.blue)
                        .frame(width: 7, height: 7)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .foregroundColor(selected ? .black : .white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background {
                if selected {
                    if reduceMotion {
                        Capsule().fill(Color.white)
                    } else {
                        Capsule().fill(Color.white).matchedGeometryEffect(id: "selected", in: highlight)
                    }
                } else {
                    Capsule().fill(Color.white.opacity(0.08))
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(NotesTargetPressStyle())
        .accessibilityLabel("Comentarios para \(target.name)")
        .accessibilityValue(target.hasNote ? "Con comentario" : "Sin comentario")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Feedback on touch-down, not on release.
private struct NotesTargetPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
