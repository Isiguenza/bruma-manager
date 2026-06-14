import Foundation
import Combine

@MainActor
class MenuViewModel: ObservableObject {
    @Published var products: [Product] = []
    @Published var categories: [Category] = []
    @Published var selectedCategoryId: String? = nil
    @Published var searchQuery: String = ""
    @Published var loading: Bool = false
    
    // Category flow
    @Published var categoryFlow: CategoryFlow?
    
    // Variant selection
    @Published var showVariantSheet: Bool = false
    @Published var selectedProductForVariant: Product?
    
    // Modifier flow
    @Published var showModifierFlow: Bool = false
    @Published var selectedProduct: Product?
    @Published var currentStepIndex: Int = 0
    @Published var stepSelections: [String: [ModifierOption]] = [:]
    
    // Notes dialog
    @Published var showNotesSheet: Bool = false
    @Published var pendingCartItem: CartItem?
    @Published var tempNotes: String = ""
    
    var filteredProducts: [Product] {
        var result = products
        
        if let catId = selectedCategoryId {
            result = result.filter { $0.categoryId == catId }
        }
        
        if !searchQuery.isEmpty {
            let q = searchQuery.lowercased()
            result = result.filter { $0.name.lowercased().contains(q) }
        }
        
        return result
    }
    
    var activeCategories: [Category] {
        categories.filter { $0.active }.sorted { $0.sortOrder < $1.sortOrder }
    }
    
    var currentStep: ModifierStep? {
        guard let flow = categoryFlow,
              currentStepIndex >= 0,
              currentStepIndex < flow.steps.count else { return nil }
        return flow.steps[currentStepIndex]
    }
    
    func loadData() async {
        loading = true
        do {
            async let prods = APIService.shared.fetchProducts()
            async let cats = APIService.shared.fetchCategories()
            products = try await prods
            categories = try await cats
        } catch {
            print("Error loading menu:", error)
        }
        loading = false
    }
    
    func selectCategory(_ categoryId: String?) {
        selectedCategoryId = categoryId
        if let catId = categoryId {
            Task { await loadCategoryFlow(catId) }
        } else {
            categoryFlow = nil
        }
    }
    
    func loadCategoryFlow(_ categoryId: String) async {
        do {
            categoryFlow = try await APIService.shared.fetchCategoryFlow(categoryId: categoryId)
        } catch {
            categoryFlow = CategoryFlow(categoryId: categoryId, useDefaultFlow: true, steps: [])
        }
    }
    
    func handleProductTap(_ product: Product, seat: String, course: Int) {
        // Product has variants → show variant picker
        if product.hasVariants && product.variants != nil {
            selectedProductForVariant = product
            showVariantSheet = true
            return
        }
        
        print("🎯 Waitress: Tapped product \(product.name) (\(product.id))")
        
        // Check product flow (hybrid: product-specific or inherited from category)
        Task {
            do {
                print("🌐 Waitress: Fetching flow for \(product.id)")
                let flow = try await APIService.shared.fetchProductFlow(productId: product.id)
                print("📱 Waitress: Received flow - useDefault: \(flow.useDefaultFlow), steps: \(flow.steps.count)")
                
                if !flow.useDefaultFlow, !flow.steps.isEmpty {
                    print("✅ Waitress: Showing modifier flow with \(flow.steps.count) steps")
                    await MainActor.run {
                        selectedProduct = product
                        stepSelections = [:]
                        currentStepIndex = 0
                        categoryFlow = flow
                        showModifierFlow = true
                    }
                    return
                }
                
                print("⏭️ Waitress: No flow, adding directly")
                await addProductDirectly(product, seat: seat, course: course)
            } catch {
                print("❌ Waitress: Error fetching flow: \(error)")
                await addProductDirectly(product, seat: seat, course: course)
            }
        }
    }
    
    @MainActor
    private func addProductDirectly(_ product: Product, seat: String, course: Int) {
        let item = CartItem(
            productId: product.id,
            productName: product.name,
            unitPrice: product.numericPrice,
            quantity: 1,
            notes: "",
            seat: seat,
            course: course,
            sentToKitchen: false,
            isBeverage: product.category?.isBeverage ?? false
        )
        pendingCartItem = item
        tempNotes = ""
        showNotesSheet = true
    }
    
    func handleVariantSelected(_ variant: ProductVariant, seat: String, course: Int) {
        guard let product = selectedProductForVariant else { return }
        let price = Double(variant.price) ?? product.numericPrice
        
        let item = CartItem(
            productId: product.id,
            productName: "\(product.name) - \(variant.name)",
            unitPrice: price,
            quantity: 1,
            notes: "",
            seat: seat,
            course: course,
            sentToKitchen: false,
            isBeverage: product.category?.isBeverage ?? false
        )
        pendingCartItem = item
        tempNotes = ""
        showVariantSheet = false
        showNotesSheet = true
    }
    
    func selectModifierOption(_ option: ModifierOption) {
        guard let step = currentStep else { return }
        
        if step.allowMultiple {
            var current = stepSelections[step.id] ?? []
            if current.contains(where: { $0.id == option.id }) {
                current.removeAll { $0.id == option.id }
            } else {
                current.append(option)
            }
            stepSelections[step.id] = current
        } else {
            stepSelections[step.id] = [option]
        }
    }
    
    func skipModifierStep() {
        stepSelections[currentStep?.id ?? ""] = []
        advanceModifierStep()
    }
    
    func advanceModifierStep(seat: String = "C", course: Int = 1) {
        guard let flow = categoryFlow else { return }
        
        if currentStepIndex + 1 < flow.steps.count {
            currentStepIndex += 1
        } else {
            // Flow complete — build cart item
            finishModifierFlow(seat: seat, course: course)
        }
    }
    
    func finishModifierFlow(seat: String, course: Int) {
        guard let product = selectedProduct else { return }
        
        var extraPrice: Double = 0
        var customModsDict: [String: Any] = [:]
        
        if let flow = categoryFlow {
            for step in flow.steps {
                if let options = stepSelections[step.id], !options.isEmpty {
                    extraPrice += options.reduce(0.0) { $0 + $1.numericPrice }
                    customModsDict[step.id] = [
                        "stepName": step.stepName,
                        "stepType": step.stepType,
                        "options": options.map { ["id": $0.id, "name": $0.name, "price": $0.price] }
                    ]
                }
            }
        }
        
        let customModifiersJSON = (try? JSONSerialization.data(withJSONObject: customModsDict))
            .flatMap { String(data: $0, encoding: .utf8) }
        
        let item = CartItem(
            productId: product.id,
            productName: product.name,
            unitPrice: product.numericPrice + extraPrice,
            quantity: 1,
            notes: "",
            customModifiers: customModifiersJSON,
            seat: seat,
            course: course,
            sentToKitchen: false,
            isBeverage: product.category?.isBeverage ?? false
        )
        
        pendingCartItem = item
        tempNotes = ""
        showModifierFlow = false
        showNotesSheet = true
    }
    
    func confirmNotes(addToCart: (CartItem) -> Void) {
        guard var item = pendingCartItem else { return }
        item.notes = tempNotes
        addToCart(item)
        pendingCartItem = nil
        tempNotes = ""
        showNotesSheet = false
    }
    
    func cancelNotes(addToCart: (CartItem) -> Void) {
        // Add without notes
        guard let item = pendingCartItem else { return }
        addToCart(item)
        pendingCartItem = nil
        tempNotes = ""
        showNotesSheet = false
    }
}
