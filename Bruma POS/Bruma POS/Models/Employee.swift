import Foundation

struct Employee: Codable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let role: String
    let employeeCode: String?
    let active: Bool?
}

struct VerifyPinResponse: Codable {
    let employee: Employee
}

struct CashRegisterStatus: Codable {
    let id: String?
    let status: String // "open" or "closed"
    
    var isOpen: Bool { status == "open" }
}
