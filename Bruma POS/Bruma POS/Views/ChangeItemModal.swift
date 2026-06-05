import SwiftUI

struct ChangeItemModal: View {
    @ObservedObject var vm: POSViewModel
    @State private var search = ""
    @State private var quantityToChange: Int = 1
    
    private var currentItem: CartItem? {
        guard let idx = vm.changeItemIndex, idx < vm.cart.count else { return nil }
        return vm.cart[idx]
    }
    
    private var filteredProducts: [Product] {
        if search.isEmpty {
            guard let catId = vm.selectedCategory else { return vm.products.filter { $0.active } }
            return vm.products.filter { $0.active && $0.categoryId == catId }
        }
        return vm.products.filter { $0.active && $0.name.localizedCaseInsensitiveContains(search) }
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Current item banner
                if let item = currentItem {
                    VStack(spacing: 0) {
                        HStack(spacing: 10) {
                            Image(systemName: "arrow.2.circlepath")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Cambiando:")
                                    .font(.caption2)
                                    .foregroundColor(Color(white: 0.5))
                                Text(item.productName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Text(vm.formatCurrency(item.unitPrice))
                                .font(.caption.weight(.medium))
                                .foregroundColor(Color(white: 0.6))
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        
                        // Quantity stepper — only show when grouped (qty > 1)
                        if item.quantity > 1 {
                            Divider().background(Color.white.opacity(0.08))
                            HStack(spacing: 16) {
                                Text("¿Cuántos cambiar?")
                                    .font(.subheadline)
                                    .foregroundColor(Color(white: 0.7))
                                Spacer()
                                HStack(spacing: 0) {
                                    Button {
                                        if quantityToChange > 1 { quantityToChange -= 1 }
                                    } label: {
                                        Image(systemName: "minus")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(quantityToChange > 1 ? .white : Color(white: 0.3))
                                            .frame(width: 32, height: 32)
                                            .background(Circle().fill(Color.white.opacity(0.08)))
                                    }
                                    .buttonStyle(.plain)
                                    
                                    Text("\(quantityToChange) de \(item.quantity)")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                        .frame(minWidth: 70)
                                        .multilineTextAlignment(.center)
                                    
                                    Button {
                                        if quantityToChange < item.quantity { quantityToChange += 1 }
                                    } label: {
                                        Image(systemName: "plus")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(quantityToChange < item.quantity ? .white : Color(white: 0.3))
                                            .frame(width: 32, height: 32)
                                            .background(Circle().fill(Color.white.opacity(0.08)))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Color.blue.opacity(0.06))
                        }
                    }
                    .background(Color.blue.opacity(0.08))
                    .onAppear { quantityToChange = item.quantity }
                }
                
                Divider().background(Color.white.opacity(0.1))
                
                // Search
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(Color(white: 0.5))
                    TextField("Buscar producto...", text: $search)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.05))
                
                Divider().background(Color.white.opacity(0.1))
                
                // Category pills (only when not searching)
                if search.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(vm.categories) { cat in
                                Button {
                                    vm.selectedCategory = cat.id
                                } label: {
                                    Text(cat.name)
                                        .font(.caption.weight(.medium))
                                        .foregroundColor(vm.selectedCategory == cat.id ? .white : Color(white: 0.6))
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(
                                            Capsule()
                                                .fill(vm.selectedCategory == cat.id ? Color.blue.opacity(0.7) : Color.white.opacity(0.07))
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                    Divider().background(Color.white.opacity(0.1))
                }
                
                // Product list
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredProducts) { product in
                            Button {
                                vm.confirmChangeItem(newProduct: product, quantityToChange: quantityToChange)
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(product.name)
                                            .font(.subheadline.weight(.medium))
                                            .foregroundColor(.white)
                                        if let cat = product.category {
                                            Text(cat.name)
                                                .font(.caption2)
                                                .foregroundColor(Color(white: 0.5))
                                        }
                                    }
                                    Spacer()
                                    Text(vm.formatCurrency(product.numericPrice))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.white)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Color.white.opacity(0.03))
                            }
                            .buttonStyle(.plain)
                            
                            Divider().background(Color.white.opacity(0.06))
                        }
                    }
                }
            }
            .background(Color(white: 0.08))
            .navigationTitle("Cambiar Producto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { vm.cancelChangeItem() }
                        .foregroundColor(.red.opacity(0.8))
                }
            }
        }
    }
}
