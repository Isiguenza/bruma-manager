import SwiftUI

struct BlurView: UIViewRepresentable {
    var style: UIBlurEffect.Style = .systemUltraThinMaterialDark
    
    func makeUIView(context: Context) -> UIVisualEffectView {
        let view = UIVisualEffectView(effect: UIBlurEffect(style: style))
        return view
    }
    
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

struct SettingsView: View {
    @ObservedObject var vm: POSViewModel
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        ZStack {
            // Nuestro propio blur dark — se ve oscuro sobre fondo negro
            BlurView(style: .systemUltraThinMaterialDark)
                .ignoresSafeArea()
            
            // Sutil tinte negro encima para más oscuridad
            Color.black.opacity(0.3)
                .ignoresSafeArea()
            
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    
                    // MARK: - Header
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.primary)
                                .frame(width: 44, height: 44)
                                .glassEffect(.clear)
                        }
                        .buttonStyle(.plain)
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
                    
                    // MARK: - Pedidos Section
                    sectionHeader("Pedidos")
                    
                    glassCard {
                        settingsRow {
                            Label("Delivery", systemImage: "bicycle")
                                .foregroundColor(.primary)
                        } trailing: {
                            Toggle("", isOn: $vm.config.deliveryEnabled)
                                .tint(.blue)
                                .labelsHidden()
                                .onChange(of: vm.config.deliveryEnabled) { _ in vm.config.save() }
                        }
                        
                        rowDivider()
                        
                        settingsRow {
                            Label("Para Llevar", systemImage: "bag")
                                .foregroundColor(.primary)
                        } trailing: {
                            Toggle("", isOn: $vm.config.takeoutEnabled)
                                .tint(.blue)
                                .labelsHidden()
                                .onChange(of: vm.config.takeoutEnabled) { _ in vm.config.save() }
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    // MARK: - Mesas Section
                    sectionHeader("Mesas")
                    
                    glassCard {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Toca para desactivar una mesa")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            LazyVGrid(columns: [
                                GridItem(.flexible()),
                                GridItem(.flexible()),
                                GridItem(.flexible()),
                                GridItem(.flexible())
                            ], spacing: 10) {
                                ForEach(vm.tables.sorted {
                                    (Int($0.number) ?? 0) < (Int($1.number) ?? 0)
                                }) { table in
                                    tableToggleButton(table)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.bottom, 8)
                        }
                        .padding(.vertical, 8)
                    }
                    .padding(.horizontal, 20)
                    
                    // MARK: - Dispositivos Section
                    sectionHeader("Dispositivos")
                    
                    glassCard {
                        settingsRow {
                            VStack(alignment: .leading, spacing: 2) {
                                Label("Customer Display", systemImage: "tv")
                                    .foregroundColor(.primary)
                                Text("Activa este modo en la iPad del cliente")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        } trailing: {
                            Toggle("", isOn: $vm.config.customerDisplayEnabled)
                                .tint(.blue)
                                .labelsHidden()
                                .onChange(of: vm.config.customerDisplayEnabled) { _ in
                                    vm.config.save()
                                    if vm.config.customerDisplayEnabled {
                                        vm.currentScreen = .customerDisplay
                                    }
                                }
                        }
                        
                        rowDivider()
                        
                        settingsRow {
                            Label("Banco", systemImage: "building.columns")
                                .foregroundColor(.primary)
                        } trailing: {
                            TextField("BBVA", text: $vm.config.bankBank)
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                                .frame(width: 140)
                                .onChange(of: vm.config.bankBank) { _ in vm.config.save() }
                        }
                        
                        rowDivider()
                        
                        settingsRow {
                            Label("Nombre cuenta", systemImage: "person")
                                .foregroundColor(.primary)
                        } trailing: {
                            TextField("Nombre", text: $vm.config.bankName)
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                                .frame(width: 180)
                                .onChange(of: vm.config.bankName) { _ in vm.config.save() }
                        }
                        
                        rowDivider()
                        
                        settingsRow {
                            Label("CLABE", systemImage: "number")
                                .foregroundColor(.primary)
                        } trailing: {
                            TextField("18 dígitos", text: $vm.config.bankCLABE)
                                .multilineTextAlignment(.trailing)
                                .foregroundColor(.secondary)
                                .font(.system(size: 14, design: .monospaced))
                                .keyboardType(.numberPad)
                                .frame(width: 180)
                                .onChange(of: vm.config.bankCLABE) { _ in vm.config.save() }
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    // MARK: - Sistema Section
                    sectionHeader("Sistema")
                    
                    glassCard {
                        settingsRow {
                            Label("Versión", systemImage: "info.circle")
                                .foregroundColor(.primary)
                        } trailing: {
                            Text("v1.0")
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                        }
                        
                        rowDivider()
                        
                        settingsRow {
                            Label("Bruma POS", systemImage: "fork.knife")
                                .foregroundColor(.primary)
                        } trailing: {
                            Text("COCINA BRUMA")
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                        }
                    }
                    .padding(.horizontal, 20)
                    
                    Spacer(minLength: 40)
                }
            }
        }
    }
    
    // MARK: - Helpers
    
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundColor(.secondary)
            .textCase(.uppercase)
            .padding(.horizontal, 28)
            .padding(.top, 24)
            .padding(.bottom, 8)
    }
    
    private func glassCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(white: 0.12, opacity: 0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }
    
    private func settingsRow<Leading: View, Trailing: View>(
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack {
            leading()
            Spacer()
            trailing()
        }
        .frame(minHeight: 50)
    }
    
    private func rowDivider() -> some View {
        Divider()
            .padding(.leading, 36)
    }
    
    private func tableToggleButton(_ table: Table) -> some View {
        let isDisabled = vm.config.disabledTableIds.contains(table.id)
        
        return Button {
            if isDisabled {
                vm.config.disabledTableIds.removeAll { $0 == table.id }
            } else {
                vm.config.disabledTableIds.append(table.id)
            }
            vm.config.save()
        } label: {
            Text(table.number)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(isDisabled ? .secondary : .primary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isDisabled ? Color.secondary.opacity(0.1) : Color.blue.opacity(0.15))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(isDisabled ? Color.secondary.opacity(0.2) : Color.blue.opacity(0.4), lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }
}
