import SwiftUI
import PhotosUI
import StoreKit

struct ContentView: View {
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var selectedImage: UIImage?
    @State private var uploaded = false
    @State private var uploading = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red:0.06,green:0.47,blue:0.44), Color(red:0.04,green:0.32,blue:0.30)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Logo area
                VStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 22)
                            .fill(Color.white.opacity(0.15))
                            .frame(width: 88, height: 88)
                        Text("RR")
                            .font(.system(size: 34, weight: .black, design: .rounded))
                            .foregroundColor(.white)
                    }
                    Text("RedRock")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                    Text("Accountants")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .tracking(2)
                }

                Spacer()

                // Card
                VStack(spacing: 16) {
                    Text("Quick Receipt Capture")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(Color(red:0.06,green:0.35,blue:0.32))

                    Text("Snap an invoice or receipt and it goes straight to your RedRock inbox. Open the full app to manage your books.")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)

                    if let img = selectedImage {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 140)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    if uploaded {
                        Label("Saved to inbox!", systemImage: "checkmark.circle.fill")
                            .foregroundColor(.green)
                            .font(.system(size: 15, weight: .semibold))
                    } else {
                        HStack(spacing: 12) {
                            Button {
                                showCamera = true
                            } label: {
                                Label("Camera", systemImage: "camera.fill")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(red:0.06,green:0.47,blue:0.44))
                                    .foregroundColor(.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            Button {
                                showPhotoPicker = true
                            } label: {
                                Label("Gallery", systemImage: "photo.fill")
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(red:0.06,green:0.47,blue:0.44).opacity(0.12))
                                    .foregroundColor(Color(red:0.06,green:0.47,blue:0.44))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .font(.system(size: 15, weight: .semibold))
                            }
                        }
                    }

                    Divider()

                    Button {
                        openFullApp()
                    } label: {
                        HStack {
                            Image(systemName: "arrow.up.right.square")
                            Text("Open Full App")
                                .fontWeight(.semibold)
                        }
                        .foregroundColor(Color(red:0.06,green:0.47,blue:0.44))
                        .font(.system(size: 15))
                    }
                }
                .padding(24)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .shadow(color:.black.opacity(0.12), radius: 20, y: 8)
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraView(image: $selectedImage, isPresented: $showCamera)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: Binding(
            get: { nil },
            set: { item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self),
                       let img = UIImage(data: data) {
                        selectedImage = img
                    }
                }
            }
        ), matching: .images)
    }

    func openFullApp() {
        if let url = URL(string: "https://redrock-ledger.pages.dev") {
            UIApplication.shared.open(url)
        }
    }
}

struct CameraView: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Binding var isPresented: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraView
        init(_ p: CameraView) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.image = info[.originalImage] as? UIImage
            parent.isPresented = false
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.isPresented = false
        }
    }
}
