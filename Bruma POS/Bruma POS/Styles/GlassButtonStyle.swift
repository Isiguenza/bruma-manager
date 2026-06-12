import SwiftUI

struct GlassCircleButton: View {
    let systemImage: String
    let action: () -> Void
    let isActive: Bool
    let activeColor: Color
    
    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(isActive ? activeColor : .white)
                .frame(width: 48, height: 48)
                .modifier(GlassCircle(isActive: isActive, color: activeColor))
        }
        .buttonStyle(.plain)
    }
}

struct GlassCircle: ViewModifier {
    let isActive: Bool
    let color: Color
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isActive ? .regular.tint(color) : .regular,
                    in: .circle
                )
        } else {
            content
                .background(
                    Circle()
                        .fill(isActive ? color.opacity(0.15) : Color.white.opacity(0.06))
                        .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
        }
    }
}

struct GlassPillButton: View {
    let label: String
    let systemImage: String?
    let action: () -> Void
    let isActive: Bool
    let activeColor: Color
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon = systemImage {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .medium))
                }
                Text(label)
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .modifier(GlassCapsule(isActive: isActive, color: activeColor))
        }
        .buttonStyle(.plain)
    }
}

struct GlassCapsule: ViewModifier {
    let isActive: Bool
    let color: Color
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isActive ? .regular.tint(color).interactive() : .regular.interactive(),
                    in: .capsule
                )
        } else {
            content
                .background(
                    Capsule()
                        .fill(isActive ? color.opacity(0.15) : Color.white.opacity(0.06))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
        }
    }
}

struct NativeSegmentedPicker<Tag: Hashable>: UIViewRepresentable {
    let segments: [(label: String, tag: Tag)]
    @Binding var selection: Tag
    let selectedTint: UIColor

    func makeUIView(context: Context) -> UISegmentedControl {
        let control = UISegmentedControl(items: segments.map { $0.label })
        control.selectedSegmentTintColor = selectedTint
        control.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .selected)
        control.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
        control.addTarget(context.coordinator, action: #selector(Coordinator.valueChanged), for: .valueChanged)
        return control
    }

    func updateUIView(_ uiView: UISegmentedControl, context: Context) {
        let currentTitles = (0..<uiView.numberOfSegments).map { uiView.titleForSegment(at: $0) ?? "" }
        let newTitles = segments.map { $0.label }
        if currentTitles != newTitles {
            uiView.removeAllSegments()
            for (i, seg) in segments.enumerated() {
                uiView.insertSegment(withTitle: seg.label, at: i, animated: true)
            }
            uiView.selectedSegmentTintColor = selectedTint
            uiView.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .selected)
            uiView.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
        }
        if let index = segments.firstIndex(where: { $0.tag == selection }) {
            uiView.selectedSegmentIndex = index
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject {
        let parent: NativeSegmentedPicker
        init(_ parent: NativeSegmentedPicker) { self.parent = parent }
        @objc func valueChanged(_ sender: UISegmentedControl) {
            let index = sender.selectedSegmentIndex
            if index >= 0 && index < parent.segments.count {
                parent.selection = parent.segments[index].tag
            }
        }
    }
}

struct KitchenButtonBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(.orange).interactive(), in: .capsule)
        } else {
            content
                .background(
                    Capsule()
                        .fill(Color.orange.opacity(0.2))
                        .overlay(Capsule().stroke(Color.orange.opacity(0.4), lineWidth: 1.5))
                )
        }
    }
}

struct OfflineIndicator: View {
    var body: some View {
        if #available(iOS 26.0, *) {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 6, height: 6)
                Text("Offline")
                    .font(.caption2.weight(.bold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .glassEffect(.regular.tint(.red).interactive(), in: .capsule)
        } else {
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 6, height: 6)
                Text("Offline")
                    .font(.caption2.weight(.bold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color.red.opacity(0.2))
                    .overlay(
                        Capsule()
                            .stroke(Color.red.opacity(0.4), lineWidth: 1)
                    )
            )
        }
    }
}

