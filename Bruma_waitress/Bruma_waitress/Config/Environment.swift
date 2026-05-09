import Foundation

enum AppEnvironment {
    case development
    case production
    
    static var current: AppEnvironment {
        // Cambia manualmente entre .development y .production
        return .production
    }
    
    var baseURL: String {
        switch self {
        case .development:
            return "http://192.168.0.227:3000" // Mac local server
        case .production:
            return "http://192.168.0.109:3000" // Producción local
        }
    }
    
    var printServerURL: String {
        switch self {
        case .development:
            return "http://192.168.0.227:3001"
        case .production:
            return "http://192.168.0.109:3001"
        }
    }
}
