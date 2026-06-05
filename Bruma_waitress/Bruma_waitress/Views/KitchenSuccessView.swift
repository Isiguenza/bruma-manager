import SwiftUI

struct KitchenSuccessView: View {
    let onComplete: () -> Void
    
    @State private var phase: AnimationPhase = .idle
    @State private var greenFillScale: CGFloat = 0
    @State private var logoOpacity: CGFloat = 1
    @State private var checkmarkOpacity: CGFloat = 0
    @State private var checkmarkScale: CGFloat = 0.3
    @State private var circleStrokeTrim: CGFloat = 0
    @State private var circleRotation: Double = -90
    @State private var textOpacity: CGFloat = 0
    @State private var textOffset: CGFloat = 20
    @State private var detailOpacity: CGFloat = 0
    
    enum AnimationPhase {
        case idle, logoShown, morphing, checkmarkShown, fillingGreen, complete
    }
    
    var body: some View {
        ZStack {
            // Background that transitions from white to green
            Color.white
                .ignoresSafeArea()
            
            // Green expanding circle (fills screen)
            GeometryReader { geo in
                let size = max(geo.size.width, geo.size.height) * 3
                Circle()
                    .fill(Color(red: 0.22, green: 0.78, blue: 0.40)) // #38C840 vibrant green
                    .frame(width: size, height: size)
                    .position(
                        x: geo.size.width / 2,
                        y: geo.size.height * 0.25
                    )
                    .scaleEffect(greenFillScale, anchor: .center)
            }
            
            // Content
            VStack(spacing: 24) {
                Spacer().frame(height: 100)
                
                // Logo / Checkmark circle
                ZStack {
                    // Outer circle that draws itself
                    Circle()
                        .trim(from: 0, to: circleStrokeTrim)
                        .stroke(Color.white, lineWidth: 4)
                        .frame(width: 110, height: 110)
                        .rotationEffect(.degrees(circleRotation))
                    
                    Circle()
                        .stroke(Color.white.opacity(0.3), lineWidth: 4)
                        .frame(width: 110, height: 110)
                    
                    // Logo (B) - placeholder for brand logo
                    Text("B")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .opacity(logoOpacity)
                    
                    // Checkmark
                    Image(systemName: "checkmark")
                        .font(.system(size: 44, weight: .bold))
                        .foregroundColor(.white)
                        .opacity(checkmarkOpacity)
                        .scaleEffect(checkmarkScale)
                }
                .frame(width: 120, height: 120)
                
                // Title text
                VStack(spacing: 8) {
                    Text(phase == .logoShown || phase == .morphing ? "Enviando a cocina..." : "¡Enviado a cocina!")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                        .opacity(textOpacity)
                        .offset(y: textOffset)
                    
                    Text("Toca para continuar")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                        .opacity(detailOpacity)
                }
                
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            if phase == .complete {
                onComplete()
            }
        }
        .onAppear {
            runAnimation()
        }
    }
    
    private func runAnimation() {
        // Phase 1: Show logo briefly (white bg)
        withAnimation(.easeInOut(duration: 0.3)) {
            phase = .logoShown
            circleStrokeTrim = 1
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            // Phase 2: Morph logo to checkmark
            withAnimation(.easeInOut(duration: 0.25)) {
                phase = .morphing
                logoOpacity = 0
            }
            
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6, blendDuration: 0)) {
                checkmarkOpacity = 1
                checkmarkScale = 1
            }
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            // Phase 3: Green fills screen
            withAnimation(.easeInOut(duration: 0.6)) {
                phase = .fillingGreen
                greenFillScale = 1
            }
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            // Phase 4: Show text
            withAnimation(.easeOut(duration: 0.4)) {
                phase = .complete
                textOpacity = 1
                textOffset = 0
                detailOpacity = 1
            }
        }
    }
}

#Preview {
    KitchenSuccessView {
        print("Complete!")
    }
}
