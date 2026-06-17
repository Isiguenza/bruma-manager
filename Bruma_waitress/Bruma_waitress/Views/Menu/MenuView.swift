import SwiftUI

struct MenuView: View {
    @ObservedObject var menuVM: MenuViewModel
    @ObservedObject var cartVM: CartViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                TextField("Buscar producto...", text: $menuVM.searchQuery)
                    .foregroundColor(.white)
                    .autocorrectionDisabled()

                
                if !menuVM.searchQuery.isEmpty {
                    Button(action: { menuVM.searchQuery = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .glassEffect(.regular.interactive())
            .padding(.horizontal, 16)
            .padding(.top, 8)
            
            // Category tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    CategoryPill(
                        name: "Todos",
                        isSelected: menuVM.selectedCategoryId == nil,
                        action: { menuVM.selectCategory(nil) }
                    )
                    
                    ForEach(menuVM.activeCategories) { cat in
                        CategoryPill(
                            name: cat.name,
                            isSelected: menuVM.selectedCategoryId == cat.id,
                            action: { menuVM.selectCategory(cat.id) }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            
            // Product grid
            if menuVM.loading {
                Spacer()
                ProgressView().tint(.white)
                Spacer()
            } else if menuVM.filteredProducts.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                    Text("No hay productos")
                        .foregroundColor(.gray)
                }
                Spacer()
            } else {
                ScrollView(showsIndicators: false) {
                    let columns = [
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10),
                    ]
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(menuVM.filteredProducts) { product in
                            ProductTileView(product: product) {
                                menuVM.handleProductTap(
                                    product,
                                    seat: cartVM.activeSeat,
                                    course: cartVM.activeCourse
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 120)
                }
            }
        }
        .task { await menuVM.loadData() }
        // Variant sheet
        .sheet(isPresented: $menuVM.showVariantSheet) {
            if let product = menuVM.selectedProductForVariant {
                VariantSheet(product: product) { variant in
                    menuVM.handleVariantSelected(
                        variant,
                        seat: cartVM.activeSeat,
                        course: cartVM.activeCourse
                    )
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
        }
        // Modifier flow
        .sheet(isPresented: $menuVM.showModifierFlow) {
            ModifierFlowView(menuVM: menuVM, cartVM: cartVM)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        // Notes sheet
        .sheet(isPresented: $menuVM.showNotesSheet) {
            NotesSheet(
                productName: menuVM.pendingCartItem?.productName ?? "",
                notes: $menuVM.tempNotes,
                onConfirm: {
                    menuVM.confirmNotes { item in cartVM.addItem(item) }
                },
                onSkip: {
                    menuVM.cancelNotes { item in cartVM.addItem(item) }
                }
            )
            .presentationDetents([.height(280)])
            .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - Category Pill

struct CategoryPill: View {
    let name: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(name)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .white : .gray)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .glassEffect(isSelected ? .regular.tint(.blue).interactive() : .regular.interactive())
        }
    }
}
