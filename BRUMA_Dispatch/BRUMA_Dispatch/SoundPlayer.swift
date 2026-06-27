//
//  SoundPlayer.swift
//  BRUMA_Dispatch
//
//  Created by Iñaki Sigüenza on 11/04/26.
//

import AVFoundation
import UIKit
import Combine

class SoundPlayer: ObservableObject {
    static let shared = SoundPlayer()
    
    private var audioPlayer: AVAudioPlayer?
    private var secondaryAudioPlayer: AVAudioPlayer?
    @Published var isEnabled: Bool = true // Always enabled
    
    private init() {
        setupAudioSession()
        loadSounds()
    }
    
    private func setupAudioSession() {
        do {
            // Configurar para reproducción con volumen máximo
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            
            // Forzar volumen del sistema al máximo (si es posible)
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(.speaker)
        } catch {
            print("❌ Error setting up audio session: \(error)")
        }
    }
    
    private func loadSounds() {
        // Primary sound (default / food mode)
        if let primaryURL = Bundle.main.url(forResource: "chime_alert", withExtension: "wav") {
            do {
                audioPlayer = try AVAudioPlayer(contentsOf: primaryURL)
                audioPlayer?.volume = 1.0
                audioPlayer?.prepareToPlay()
                print("✅ Primary sound loaded (chime_alert.wav)")
            } catch {
                print("❌ Error loading primary sound: \(error)")
            }
        } else {
            print("❌ Primary sound file not found")
        }
        
        // Secondary sound (beverages mode)
        if let secondaryURL = Bundle.main.url(forResource: "notification_sound_secondary", withExtension: "wav") {
            do {
                secondaryAudioPlayer = try AVAudioPlayer(contentsOf: secondaryURL)
                secondaryAudioPlayer?.volume = 1.0
                secondaryAudioPlayer?.prepareToPlay()
                print("✅ Secondary sound loaded (notification_sound_secondary.wav)")
            } catch {
                print("❌ Error loading secondary sound: \(error)")
            }
        } else {
            print("⚠️ Secondary sound file not found (notification_sound_secondary.wav)")
        }
    }
    
    func playNotification(viewMode: String = "all") {
        let isBeverageMode = (viewMode == "beverages")
        let player = isBeverageMode ? secondaryAudioPlayer : audioPlayer
        let soundName = isBeverageMode ? "notification_sound_secondary.wav" : "chime_alert.wav"
        
        guard let p = player else {
            print("❌ Audio player not initialized for \(soundName)")
            return
        }
        
        // Vibrate device
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        
        // Force max volume before playing
        p.volume = 1.0
        p.currentTime = 0
        p.play()
        print("🔔 Playing \(soundName) at MAX VOLUME (forced)")
    }
    
    func toggleSound() {
        isEnabled.toggle()
        print(isEnabled ? "🔊 Sound enabled" : "🔇 Sound disabled")
    }
}
