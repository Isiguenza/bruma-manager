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
            return "http://192.168.0.69:3000" // Mac local server (docker-compose.override.yml maps 3000:3000)
        case .production:
            return "https://api.cocinabruma.com.mx" // Nuevo backend Express
        }
    }
    
    var printServerURL: String {
        switch self {
        case .development:
            return "http://192.168.0.69:3003"
        case .production:
            return "http://192.168.0.152:3001"
        }
    }
}
