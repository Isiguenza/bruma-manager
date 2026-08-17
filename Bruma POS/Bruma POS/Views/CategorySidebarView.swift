import SwiftUI

struct CategorySidebarView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Search
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                TextField("Buscar productos...", text: $vm.searchQuery)
                    .foregroundColor(.white)
                    .onChange(of: vm.searchQuery) { _, newValue in
                        if !newValue.isEmpty { vm.selectedCategory = nil }
                    }
                if !vm.searchQuery.isEmpty {
                    Button {
                        vm.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.06))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            
        
            
            // Categories
            ScrollView(showsIndicators: false){
                VStack(spacing: 6) {
                    ForEach(vm.categories) { category in
                        CategoryButton(
                            category: category,
                            isSelected: vm.selectedCategory == category.id
                        ) {
                            vm.selectedCategory = category.id
                            vm.searchQuery = ""
                            vm.resetFlow()
                        }
                    }
                }
                .padding(6)
                
            }
        }
    }
}

// MARK: - Category Button

struct CategoryButton: View {
    let category: Category
    let isSelected: Bool
    let action: () -> Void
    
    private var categoryColor: Color {
        if let hex = category.color { return Color(hex: hex) }
        return .gray
    }
    
    var body: some View {
        Button(action: action) {
            HStack {
                if isSelected {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(categoryColor)
                        .frame(width: 4)
                }
                
                Text(category.name)
                    .font(.subheadline.weight(isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? categoryColor : .white)
                
                Spacer()
                
                if isSelected {
                    Circle()
                        .fill(categoryColor)
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                Capsule()
                    .fill(isSelected ? Color(uiColor: .systemGray6).opacity(0.7) : Color(uiColor: .systemGray6).opacity(0.4))
                    .overlay(Capsule().stroke(isSelected ? categoryColor.opacity(0.4) : Color.clear, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Color Hex Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: Double
        switch hex.count {
        case 3:
            r = Double((int >> 8) * 17) / 255
            g = Double((int >> 4 & 0xF) * 17) / 255
            b = Double((int & 0xF) * 17) / 255
        case 6:
            r = Double(int >> 16) / 255
            g = Double(int >> 8 & 0xFF) / 255
            b = Double(int & 0xFF) / 255
        default:
            r = 0.42; g = 0.44; b = 0.50
        }
        self.init(red: r, green: g, blue: b)
    }
}
