//
//  ContentView.swift
//  BRUMA_Dispatch
//
//  Redesigned to match Figma KDS light mode
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = OrdersViewModel()
    @StateObject private var soundPlayer = SoundPlayer.shared
    @AppStorage("appColorScheme") private var appColorScheme: String = "system"
    @State private var showSettings = false

    private var preferredScheme: ColorScheme? {
        switch appColorScheme {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color(UIColor.systemGroupedBackground).ignoresSafeArea()
                
                VStack(spacing: 0) {
                    headerBar
                    
                    if viewModel.batches.isEmpty {
                        emptyState
                    } else {
                        ScrollView(.vertical, showsIndicators: true) {
                            BentoGridLayout(spacing: 16, columnCount: 3) {
                                ForEach(viewModel.batches, id: \.id) { batch in
                                    BatchCardView(
                                        batch: batch,
                                        isExpanded: viewModel.expandedBatchIds.contains(batch.id),
                                        onToggleExpand: { viewModel.toggleExpand(batchId: batch.id) },
                                        onMarkAsReady: { Task { await viewModel.markBatchAsReady(batch: batch) } },
                                        onRush: { Task { await viewModel.toggleRush(batch: batch) } },
                                        onHold: { Task { await viewModel.toggleHold(batch: batch) } },
                                        viewModel: viewModel
                                    )
                                }
                            }
                            .padding(16)
                        }
                    }
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showSettings) {
                SettingsSheet(appColorScheme: $appColorScheme)
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .preferredColorScheme(preferredScheme)
    }
    
    // MARK: — Header
    
    private var headerBar: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                HStack{
                    Text("BRUMA KDS")
                        .font(.system(size: 28, weight: .black))
                        .foregroundColor(Color(UIColor.label))
                    Circle()
                        .foregroundStyle(.green)
                        .frame(width: 10, height: 10)
                }
                let count = viewModel.batches.filter { !$0.isOnHold }.count
                Text("\(count) orden\(count == 1 ? "" : "es") activa\(count == 1 ? "" : "s")")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(UIColor.secondaryLabel))
            }
            
            Spacer()
            
            TimelineView(.periodic(from: Date(), by: 1.0)) { context in
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                        .font(.system(size: 14))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                    Text(formatClock(context.date))
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundColor(Color(UIColor.label))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Color(UIColor.secondarySystemBackground))
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color(UIColor.separator), lineWidth: 0.5)
                )
            }
            
            Spacer()
            
            HStack(spacing: 10) {
                Button { Task { await viewModel.fetchOrders() } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Forzar Actualizar")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(Color(UIColor.label))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(UIColor.separator), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
                
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 18))
                        .foregroundColor(Color(UIColor.secondaryLabel))
                        .frame(width: 42, height: 42)
                        .background(Color(UIColor.secondarySystemBackground))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(UIColor.separator), lineWidth: 0.5)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color(UIColor.systemBackground))
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(Color(UIColor.separator)),
            alignment: .bottom
        )
    }
    
    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.green.opacity(0.7))
            Text("No hay órdenes pendientes")
                .font(.system(size: 22, weight: .medium))
                .foregroundColor(Color(UIColor.secondaryLabel))
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private func formatClock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm:ss a"
        formatter.locale = Locale(identifier: "en_US")
        return formatter.string(from: date)
    }
}

#Preview {
    ContentView()
}

// MARK: — Settings Sheet

struct SettingsSheet: View {
    @Binding var appColorScheme: String
    @Environment(\.dismiss) private var dismiss

    private let options: [(String, String, String)] = [
        ("system", "Automático", "circle.lefthalf.filled"),
        ("light",  "Claro",      "sun.max.fill"),
        ("dark",   "Oscuro",     "moon.fill"),
    ]

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Apariencia")) {
                    ForEach(options, id: \.0) { value, label, icon in
                        Button {
                            appColorScheme = value
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: icon)
                                    .font(.system(size: 18))
                                    .foregroundColor(.blue)
                                    .frame(width: 28)
                                Text(label)
                                    .foregroundColor(Color(UIColor.label))
                                Spacer()
                                if appColorScheme == value {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.blue)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("Ajustes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
    }
}
