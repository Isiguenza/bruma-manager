import SwiftUI

struct ProductGridView: View {
    @ObservedObject var vm: POSViewModel

    var body: some View {
        Group {
            if let node = vm.activeFlowNode {
                flowNodeScreen(node)
            } else {
                legacyContent
            }
        }
    }

    private var legacyContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Selecciona un producto")
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                Spacer()
            }
            .padding(16)
            Divider().background(Color.white.opacity(0.1))
            productsList
        }
    }

    // MARK: - Graph flow

    private func flowNodeScreen(_ node: FlowNode) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(vm.flowBreadcrumbs, id: \.index) { crumb in
                            Button(crumb.title) { vm.returnToFlowVisit(crumb.index) }
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.blue)
                                .buttonStyle(.plain)
                        }
                    }
                }
                HStack {
                    Button {
                        Haptics.tap()
                        vm.handleBackInFlow()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "chevron.left")
                            Text("Atrás")
                        }
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.flatCapsuleNeutral)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(node.title).font(.title2.weight(.bold)).foregroundColor(.white)
                        if let subtitle = node.subtitle { Text(subtitle).font(.subheadline).foregroundColor(.gray) }
                    }
                    Spacer()
                    Text(vm.formatCurrency(vm.flowLiveTotal())).font(.headline.weight(.bold)).foregroundColor(.green)
                }
            }
            .padding(16)
            Divider().background(Color.white.opacity(0.1))
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    if node.includeNoneOption {
                        FlowOptionCard(label: node.noneLabel ?? "Sin \(node.title.lowercased())", price: nil, selected: vm.activeFlowSelectedOptionIds.isEmpty) {
                            Haptics.tap(); vm.handleStepSelection(nil)
                        }
                    }
                    ForEach(node.options, id: \.id) { option in
                        FlowOptionCard(label: option.label, price: option.effectivePrice == 0 ? nil : option.effectivePrice, selected: vm.activeFlowSelectedOptionIds.contains(option.id)) {
                            Haptics.tap()
                            vm.handleStepSelection(option)
                        }
                    }
                }
                .padding(20)
            }
            if node.selectMode == "multi" {
                Button { Haptics.tap(); vm.advanceToNextStep() } label: {
                    Text("Siguiente (\(vm.activeFlowSelectedOptionIds.count)/\(node.maxSelections.map(String.init) ?? "∞"))")
                        .font(.callout.weight(.semibold)).foregroundColor(.white).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .buttonStyle(.flatCapsule(.blue))
                .padding(16)
                .disabled(vm.activeFlowSelectedOptionIds.count < node.minSelections || (node.maxSelections != nil && vm.activeFlowSelectedOptionIds.count > node.maxSelections!))
            }
        }
    }

    // MARK: - Products List
    
    private var productsList: some View {
        Group {
            if vm.selectedCategory == nil && vm.searchQuery.isEmpty {
                VStack {
                    Spacer()
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("Selecciona una categoría")
                        .font(.headline)
                        .foregroundColor(.gray)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else if vm.filteredProducts.isEmpty {
                VStack {
                    Spacer()
                    Image(systemName: "tray")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("No hay productos")
                        .font(.headline)
                        .foregroundColor(.gray)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 20) {
                        ForEach(vm.groupedFilteredProducts) { group in
                            if let title = group.title {
                                Text(title)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundColor(.gray)
                                    .padding(.horizontal, 20)
                            }
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16) {
                                ForEach(group.products) { product in
                                    ProductCardView(product: product, vm: vm)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.vertical, 20)
                }
            }
        }
    }
    
}

private struct FlowOptionCard: View {
    let label: String
    let price: Double?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                VStack(spacing: 8) {
                    Text(label).font(.subheadline.weight(.medium)).foregroundColor(.white).multilineTextAlignment(.center)
                    if let price { Text("+\(String(format: "$%.2f", price))").font(.caption).foregroundColor(.blue) }
                }
                .frame(maxWidth: .infinity).frame(height: 110)
                .modifier(FlatCardTinted(color: selected ? .blue : .gray))
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue).padding(8) }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Product Card

struct ProductCardView: View {
    let product: Product
    @ObservedObject var vm: POSViewModel
    
    private var categoryObj: Category? {
        vm.categories.first(where: { $0.id == product.categoryId })
    }
    
    private var isPlatform: Bool {
        vm.isPlatformDelivery
    }
    
    private var displayPrice: Double {
        isPlatform ? product.numericPlatformPrice : product.numericPrice
    }
    
    var body: some View {
        Button {
            vm.handleProductClick(product)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Product name
                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                Spacer()
                
                // Price — los productos con variantes no tienen precio base
                // propio (cada variante trae el suyo), así que no mostramos
                // "$0.00" aquí.
                if !product.hasVariants || displayPrice > 0 {
                    HStack(spacing: 4) {
                        Text(vm.formatCurrency(displayPrice))
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)

                        if isPlatform && product.platformPrice != nil {
                            Image(systemName: "motorcycle")
                                .font(.caption2)
                                .foregroundColor(.orange)
                        }
                    }
                }
                
                // Category badge
                if let cat = categoryObj {
                    Text(cat.name)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color(hex: cat.color ?? "#6B7280").opacity(0.15))
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: cat.color ?? "#6B7280").opacity(0.3), lineWidth: 1))
                        )
                        .foregroundColor(Color(hex: cat.color ?? "#6B7280"))
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 140, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
