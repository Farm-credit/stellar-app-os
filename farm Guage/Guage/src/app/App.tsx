import { Footer } from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to NovaLaunch</h1>
          <p className="text-gray-600">Scroll down to see the footer component</p>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
