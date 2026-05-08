import Foundation

enum AppEnvironment {
    case development
    case production
    
    static var current: AppEnvironment {
        #if DEBUG
        return .development
        #else
        return .production
        #endif
    }
    
    var baseURL: String {
        switch self {
        case .development:
            return "http://192.168.0.227:3000" // Mac local server
        case .production:
            return "https://bruma.drinksespantapajaros.com.mx"
        }
    }
    
    var printServerURL: String {
        switch self {
        case .development:
            return "http://192.168.0.227:3001"
        case .production:
            return "https://bruma.drinksespantapajaros.com.mx:3001"
        }
    }
}
