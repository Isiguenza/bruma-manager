import SwiftUI

struct ModifierFlowView: View {
    @ObservedObject var menuVM: MenuViewModel
    @ObservedObject var cartVM: CartViewModel
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            Color(red: 0.08, green: 0.08, blue: 0.08).ignoresSafeArea()
            
            VStack(spacing: 16) {
                // Header
                HStack {
                    if #available(iOS 26.0, *) {
                        Button(action: {
                            menuVM.showModifierFlow = false
                            dismiss()
                        }) {
                            Image(systemName: "xmark")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.glass)
                        .clipShape(Capsule())
                    } else {
                        Button(action: {
                            menuVM.showModifierFlow = false
                            dismiss()
                        }) {
                            Image(systemName: "xmark")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(.ultraThinMaterial)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    
                    Spacer()
                    Text(menuVM.selectedProduct?.name ?? "")
                        .font(.headline)
                        .foregroundColor(.white)
                    Spacer()
                    // Step indicator
                    if let flow = menuVM.categoryFlow {
                        Text("\(menuVM.currentStepIndex + 1)/\(flow.steps.count)")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.gray)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                
                if let step = menuVM.currentStep {
                    VStack(spacing: 8) {
                        Text(step.stepName)
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                        
                        HStack(spacing: 8) {
                            if step.isRequired {
                                Text("Requerido")
                                    .font(.caption)
                                    .foregroundColor(.orange)
                            }
                            if step.allowMultiple {
                                Text("Selección múltiple")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    
                    ScrollView {
                        VStack(spacing: 8) {
                            if step.includeNoneOption && !step.isRequired {
                                if #available(iOS 26.0, *) {
                                    Button(action: { menuVM.skipModifierStep() }) {
                                        HStack {
                                            Text("Sin \(step.stepName)")
                                                .font(.body.weight(.medium))
                                                .foregroundStyle(.white)
                                            Spacer()
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 14)
                                    }
                                    .buttonStyle(.glass)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                } else {
                                    Button(action: { menuVM.skipModifierStep() }) {
                                        HStack {
                                            Text("Sin \(step.stepName)")
                                                .font(.body.weight(.medium))
                                                .foregroundStyle(.white)
                                            Spacer()
                                        }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 14)
                                        .background(.ultraThinMaterial)
                                        .cornerRadius(12)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            
                            if let options = step.options?.filter({ $0.active }).sorted(by: { $0.sortOrder < $1.sortOrder }) {
                                ForEach(options) { option in
                                    let isSelected = menuVM.stepSelections[step.id]?.contains(where: { $0.id == option.id }) ?? false
                                    
                                    Button(action: { menuVM.selectModifierOption(option) }) {
                                        ZStack(alignment: .topTrailing) {
                                            HStack {
                                                Text(option.name)
                                                    .font(.body.weight(.medium))
                                                    .foregroundColor(.white)
                                                Spacer()
                                                if option.numericPrice > 0 {
                                                    Text("+$\(option.numericPrice, specifier: "%.0f")")
                                                        .font(.callout)
                                                        .foregroundColor(.blue)
                                                }
                                            }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 14)
                                            
                                            if isSelected {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .font(.title3)
                                                    .foregroundStyle(.blue)
                                                    .padding(8)
                                            }
                                        }
                                        .background(isSelected ? Color.blue.opacity(0.15) : Color.white.opacity(0.06))
                                        .cornerRadius(12)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(isSelected ? Color.blue.opacity(0.5) : Color.clear, lineWidth: 1)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    
                    // Next / Finish button
                    let hasSelection = !(menuVM.stepSelections[step.id]?.isEmpty ?? true)
                    let canAdvance = !step.isRequired || hasSelection
                    let isLastStep = menuVM.currentStepIndex + 1 >= (menuVM.categoryFlow?.steps.count ?? 0)
                    
                    Group {
                        if #available(iOS 26.0, *) {
                            Button(action: {
                                menuVM.advanceModifierStep(
                                    seat: cartVM.activeSeat,
                                    course: cartVM.activeCourse
                                )
                            }) {
                                HStack(spacing: 8) {
                                    Image(systemName: hasSelection ? "checkmark.circle.fill" : "arrow.right.circle.fill")
                                        .font(.callout)
                                        .contentTransition(.symbolEffect(.replace))
                                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                                    Text(isLastStep ? (hasSelection ? "Agregar" : "Agregar sin \(step.stepName.lowercased())") : (hasSelection ? "Continuar" : "Continuar sin \(step.stepName.lowercased())"))
                                        .font(.callout.weight(.semibold))
                                        .contentTransition(.numericText())
                                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                            }
                            .buttonStyle(.glassProminent)
                            .tint(canAdvance ? Color.blue : Color.blue.opacity(0.3))
                        } else {
                            Button(action: {
                                menuVM.advanceModifierStep(
                                    seat: cartVM.activeSeat,
                                    course: cartVM.activeCourse
                                )
                            }) {
                                HStack(spacing: 8) {
                                    Image(systemName: hasSelection ? "checkmark.circle.fill" : "arrow.right.circle.fill")
                                        .font(.callout)
                                        .contentTransition(.symbolEffect(.replace))
                                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                                    Text(isLastStep ? (hasSelection ? "Agregar" : "Agregar sin \(step.stepName.lowercased())") : (hasSelection ? "Continuar" : "Continuar sin \(step.stepName.lowercased())"))
                                        .font(.callout.weight(.semibold))
                                        .contentTransition(.numericText())
                                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(canAdvance ? Color.blue : Color.blue.opacity(0.3))
                                .cornerRadius(12)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .disabled(step.isRequired && (menuVM.stepSelections[step.id]?.isEmpty ?? true))
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)
                    .animation(.spring(response: 0.35, dampingFraction: 0.8), value: hasSelection)
                }
            }
        }
    }
}
