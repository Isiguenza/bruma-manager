//
//  ContentView.swift
//  Bruma POS
//
//  Created by Iñaki Sigüenza on 02/05/26.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var vm = POSViewModel()
    @StateObject private var idle = IdleMonitor()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            switch vm.currentScreen {
            case .dashboard:
                LoginView(vm: vm)
                
            case .tableSelection:
                if vm.loading && vm.tables.isEmpty {
                    ProgressView("Cargando...")
                        .tint(.white)
                        .foregroundColor(.white)
                } else {
                    MainTabView(vm: vm)
                }
                
            case .pos:
                MainPOSView(vm: vm)
                
            case .customerDisplay:
                CustomerDisplayView(posVM: vm)
            }

            // Pantalla verde de pedidos en línea (sobre cualquier pantalla).
            if let online = vm.incomingOnlineOrder, vm.currentScreen != .customerDisplay {
                OnlineOrderModal(vm: vm, order: online)
                    .transition(.opacity)
                    .zIndex(100)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: vm.incomingOnlineOrder?.id)
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        // Rest the screen (dim + clock) after 5 min of inactivity to save
        // battery, except on the customer-facing display.
        .idleScreenRest(idle, enabled: vm.currentScreen != .customerDisplay)
        .onAppear { idle.timeout = 300 }
    }
}

#Preview {
    ContentView()
}
