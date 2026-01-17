export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
      {/* Background with tool patterns - using CSS for tool-like shapes */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-16 h-16 bg-yellow-600 rotate-45"></div>
        <div className="absolute top-20 right-20 w-12 h-12 bg-gray-600 rounded-full"></div>
        <div className="absolute bottom-20 left-20 w-20 h-8 bg-blue-600"></div>
        <div className="absolute bottom-10 right-10 w-14 h-14 bg-red-600 transform rotate-12"></div>
        <div className="absolute top-1/2 left-1/4 w-10 h-10 bg-green-600 rounded"></div>
        <div className="absolute top-1/3 right-1/3 w-18 h-6 bg-purple-600"></div>
        {/* Add more tool-like shapes */}
      </div>

      {/* Under Construction Banner */}
      <div className="relative z-20 bg-yellow-500 text-black text-center py-2 font-semibold">
        🚧 Under Construction - This site is currently being developed 🚧
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-2.5rem)] px-4">
        <div className="text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
            SEE-CAT | Cataloging Tools
          </h1>
          <h2 className="text-2xl md:text-4xl font-light text-gray-300 mb-8">
            Maintenance | Repair | Operations
          </h2>
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12">
            Standardize and cleanse material names into a structured format for
            efficient cataloging of maintenance tools, screws, nuts, bolts,
            wrenches, and other essential components.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white">
              <h3 className="font-semibold">Screws & Bolts</h3>
              <p className="text-sm text-gray-300">
                Precision fasteners catalog
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white">
              <h3 className="font-semibold">Wrenches & Tools</h3>
              <p className="text-sm text-gray-300">Hand tools inventory</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white">
              <h3 className="font-semibold">Maintenance Kits</h3>
              <p className="text-sm text-gray-300">Complete repair solutions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
