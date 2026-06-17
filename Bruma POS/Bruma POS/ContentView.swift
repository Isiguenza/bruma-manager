//
//  ContentView.swift
//  Bruma POS
//
//  Created by Iñaki Sigüenza on 02/05/26.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var vm = POSViewModel()
    
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
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
    }
}

#Preview {
    ContentView()
}
