import SwiftUI

private struct TransferCardBackground: ViewModifier {
    let isOccupied: Bool
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 14))
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(isOccupied ? Color(white: 0.08, opacity: 0.5) : Color.white.opacity(0.04))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                )
                .opacity(isOccupied ? 0.5 : 1)
        }
    }
}

private struct InfoCardBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 12))
        } else {
            content
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(white: 0.12, opacity: 0.6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                )
        }
    }
}

private struct StatusBadgeBackground: ViewModifier {
    let isOccupied: Bool
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isOccupied ? .regular.tint(.red).interactive() : .regular.tint(.green).interactive(),
                    in: .capsule
                )
        } else {
            content
                .background(
                    Capsule()
                        .fill(isOccupied ? Color.red.opacity(0.15) : Color.green.opacity(0.15))
                        .overlay(
                            Capsule()
                                .stroke(isOccupied ? Color.red.opacity(0.3) : Color.green.opacity(0.3), lineWidth: 1)
                        )
                )
        }
    }
}

struct TransferTableDialog: View {
    @ObservedObject var vm: POSViewModel
    
    var availableTables: [Table] {
        vm.tables
            .filter { $0.id != vm.selectedTable?.id }
            .sorted { (Int($0.number) ?? 0) < (Int($1.number) ?? 0) }
    }
    
    var body: some View {
        ZStack {
            // Blurred background + dark tint
            BlurView(style: .systemUltraThinMaterialDark)
                .ignoresSafeArea()
            
            Color.black.opacity(0.3)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Cambiar Mesa")
                        .font(.title3.weight(.bold))
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    GlassCircleButton(
                        systemImage: "xmark",
                        action: { vm.showTransferTableDialog = false },
                        isActive: false,
                        activeColor: .gray
                    )
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 16)
                
                // Current table info
                if let currentTable = vm.selectedTable {
                    HStack(spacing: 12) {
                        Image(systemName: "arrow.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.blue)
                        
                        Text("Mesa \(currentTable.number)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                        
                        Spacer()
                        
                        Text("Orden activa")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .modifier(StatusBadgeBackground(isOccupied: false))
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .modifier(InfoCardBackground())
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }
                
                Text("Selecciona una mesa disponible")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
                
                // Tables Grid
                ScrollView {
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 12),
                        GridItem(.flexible(), spacing: 12),
                        GridItem(.flexible(), spacing: 12)
                    ], spacing: 12) {
                        ForEach(availableTables) { table in
                            TransferTableCard(table: table) {
                                Task {
                                    await vm.transferToTable(table)
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
        }
    }
}

struct TransferTableCard: View {
    let table: Table
    let onSelect: () -> Void
    
    var isOccupied: Bool {
        table.status == "occupied"
    }
    
    var body: some View {
        Button(action: {
            if !isOccupied {
                onSelect()
            }
        }) {
            VStack(spacing: 10) {
                Image(systemName: "takeoutbag.and.cup.and.straw.fill")
                    .font(.system(size: 28))
                    .foregroundColor(isOccupied ? .gray : .white)
                
                Text(table.displayName)
                    .font(.headline)
                    .foregroundColor(isOccupied ? .gray : .white)
                
                if isOccupied {
                    Text("Ocupada")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .modifier(StatusBadgeBackground(isOccupied: true))
                } else {
                    Text("Disponible")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .modifier(StatusBadgeBackground(isOccupied: false))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 130)
            .modifier(TransferCardBackground(isOccupied: isOccupied))
        }
        .disabled(isOccupied)
    }
}
