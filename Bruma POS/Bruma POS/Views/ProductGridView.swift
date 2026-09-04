import SwiftUI

struct ProductGridView: View {
    @ObservedObject var vm: POSViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                if vm.currentStepIndex == -1 {
                    Text("Selecciona un producto")
                        .font(.title2.weight(.bold))
                        .foregroundColor(.white)
                } else if let flow = vm.categoryFlow {
                    if vm.currentStepIndex < flow.steps.count {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(flow.steps[vm.currentStepIndex].stepName)
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                            if let p = vm.selectedProduct {
                                Text(p.name)
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                        }
                    } else if vm.currentStepIndex == flow.steps.count {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Notas (opcional)")
                                .font(.title2.weight(.bold))
                                .foregroundColor(.white)
                            if let p = vm.selectedProduct {
                                Text(p.name)
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                }
                
                Spacer()
                
                if vm.currentStepIndex >= 0 {
                    Button {
                        vm.handleBackInFlow()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Atrás")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.flatCapsuleNeutral)
                }
            }
            .padding(16)
            
            Divider().background(Color.white.opacity(0.1))
            
            // Content
            if vm.currentStepIndex == -1 {
                productsList
            } else if let flow = vm.categoryFlow {
                if vm.currentStepIndex < flow.steps.count {
                    modifierStepView(step: flow.steps[vm.currentStepIndex])
                } else if vm.currentStepIndex == flow.steps.count {
                    // Notes dialog is shown automatically by the ViewModel
                    Color.clear
                        .onAppear {
                            vm.prepareFlowItemAndShowNotes()
                        }
                }
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
    
    // MARK: - Modifier Step
    
    private func modifierStepView(step: ModifierStep) -> some View {
        let showNextButton: Bool = {
            guard step.allowMultiple else { return false }
            switch step.stepType {
            case "extra":
                return step.options != nil && !step.options!.isEmpty
            case "custom", "category", "products":
                return true
            default:
                return false
            }
        }()
        
        return VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    // None option
                    if step.includeNoneOption {
                        Button {
                            if step.stepType == "extra" {
                                vm.handleStepSelection([] as [Extra])
                            } else {
                                vm.handleStepSelection(nil)
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Image(systemName: "xmark.circle")
                                    .font(.title2)
                                    .foregroundColor(.gray)
                                Text("Sin \(step.stepName.lowercased())")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundColor(.white)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 110)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color.white.opacity(0.05))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Step-specific options
                    switch step.stepType {
                    case "frosting":
                        if let options = step.options, !options.isEmpty {
                            ForEach(options) { option in
                                let isSelected = (vm.stepSelections[step.id] as? ModifierOption)?.id == option.id
                                Button {
                                    vm.handleStepSelection(option)
                                } label: {
                                    optionCard(name: option.name, price: option.numericPrice > 0 ? "+\(vm.formatCurrency(option.numericPrice))" : nil, selected: isSelected)
                                }
                                .buttonStyle(.plain)
                            }
                        } else {
                            ForEach(vm.frostings) { frosting in
                                Button {
                                    vm.selectedFrosting = frosting
                                    vm.handleStepSelection(frosting)
                                } label: {
                                    optionCard(name: frosting.name, price: nil, selected: vm.selectedFrosting?.id == frosting.id)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    case "topping":
                        if let options = step.options, !options.isEmpty {
                            ForEach(options) { option in
                                let isSelected = (vm.stepSelections[step.id] as? ModifierOption)?.id == option.id
                                Button {
                                    vm.handleStepSelection(option)
                                } label: {
                                    optionCard(name: option.name, price: option.numericPrice > 0 ? "+\(vm.formatCurrency(option.numericPrice))" : nil, selected: isSelected)
                                }
                                .buttonStyle(.plain)
                            }
                        } else {
                            ForEach(vm.toppings) { topping in
                                Button {
                                    vm.selectedTopping = topping
                                    vm.handleStepSelection(topping)
                                } label: {
                                    optionCard(name: topping.name, price: nil, selected: vm.selectedTopping?.id == topping.id)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    case "extra":
                        if let options = step.options, !options.isEmpty {
                            let selectedArray = (vm.stepSelections[step.id] as? [ModifierOption]) ?? []
                            let isMulti = step.allowMultiple
                            ForEach(options) { option in
                                let isSelected = isMulti
                                    ? selectedArray.contains(where: { $0.id == option.id })
                                    : (vm.stepSelections[step.id] as? ModifierOption)?.id == option.id
                                Button {
                                    vm.handleStepSelection(option)
                                } label: {
                                    optionCard(
                                        name: option.name,
                                        price: option.numericPrice > 0 ? "+\(vm.formatCurrency(option.numericPrice))" : nil,
                                        selected: isSelected
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        } else {
                            ForEach(vm.extras) { extra in
                                let isSelected = vm.selectedExtras.contains(where: { $0.id == extra.id })
                                Button {
                                    if isSelected {
                                        vm.selectedExtras.removeAll { $0.id == extra.id }
                                    } else {
                                        vm.selectedExtras.append(extra)
                                    }
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                        vm.handleStepSelection(vm.selectedExtras)
                                    }
                                } label: {
                                    optionCard(
                                        name: extra.name,
                                        price: extra.numericPrice > 0 ? vm.formatCurrency(extra.numericPrice) : nil,
                                        selected: isSelected
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    case "custom", "category", "products":
                        let selectedArray = (vm.stepSelections[step.id] as? [ModifierOption]) ?? []
                        if let options = step.options {
                            ForEach(options) { option in
                                let isSelected = step.allowMultiple
                                    ? selectedArray.contains(where: { $0.id == option.id })
                                    : (vm.stepSelections[step.id] as? ModifierOption)?.id == option.id
                                Button {
                                    vm.handleStepSelection(option)
                                } label: {
                                    optionCard(
                                        name: option.name,
                                        price: option.numericPrice > 0 ? "+\(vm.formatCurrency(option.numericPrice))" : nil,
                                        selected: isSelected
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    default:
                        EmptyView()
                    }
                }
                .padding(20)
            }
            
            if showNextButton {
                let hasSelection = {
                    guard let sel = vm.stepSelections[step.id] else { return false }
                    if let arr = sel as? [ModifierOption] { return !arr.isEmpty }
                    if let arr = sel as? [Extra] { return !arr.isEmpty }
                    return true
                }()
                
                Button {
                    vm.advanceToNextStep()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: hasSelection ? "checkmark.circle.fill" : "arrow.right.circle.fill")
                            .font(.callout)
                            .contentTransition(.symbolEffect(.replace))
                            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                        
                        Text(hasSelection ? "Continuar" : "Continuar sin \(step.stepName.lowercased())")
                            .font(.callout.weight(.semibold))
                            .contentTransition(.numericText())
                            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.flatCapsule(.blue))
                .padding(20)
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
            }
        }
    }
    
    private func optionCard(name: String, price: String?, selected: Bool) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 8) {
                Text(name)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                
                if let price = price {
                    Text(price)
                        .font(.caption)
                        .foregroundColor(.blue)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 120)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(selected ? Color.blue.opacity(0.15) : Color.white.opacity(0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(selected ? Color.blue.opacity(0.4) : Color.white.opacity(0.1), lineWidth: selected ? 1.5 : 1)
            )
            
            if selected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.blue)
                    .padding(8)
            }
        }
    }
    
    // MARK: - Notes Step
    
    private var notesStepView: some View {
        VStack(spacing: 20) {
            Spacer()
            
            VStack(alignment: .leading, spacing: 8) {
                Text("¿Alguna nota especial para este producto?")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(.white)
                
                Text("Opcional: indica preferencias, alergias o instrucciones especiales")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .frame(maxWidth: 500, alignment: .leading)
            
            TextEditor(text: $vm.productNotes)
                .scrollContentBackground(.hidden)
                .foregroundColor(.white)
                .padding(12)
                .frame(maxWidth: 500, minHeight: 120)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
                )
            
            Button {
                vm.finishFlowAndAddToCart()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "cart.badge.plus")
                    Text("Agregar al carrito")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: 500)
                .frame(height: 56)
                .background(Color.blue.opacity(0.2))
                .foregroundColor(.blue)
                .cornerRadius(14)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.blue.opacity(0.4), lineWidth: 1.5))
            }
            
            Spacer()
        }
        .padding(24)
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
