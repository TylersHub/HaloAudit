import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditorView } from "./components/AuditorView";
// import { ChevronDown } from "lucide-react";

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  // This effect will open the app on first launch, similar to the Swift version
  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="w-full h-full bg-transparent flex justify-center">
      <motion.div
        className="w-[540px] bg-black bg-opacity-80 backdrop-blur-md shadow-2xl overflow-hidden"
        animate={{
          height: isOpen ? "140px" : "36px",
        }}
        transition={{ type: "spring", damping: 20, stiffness: 150 }}
      >
        <div className="w-full h-full relative">
          {/* Content when open */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                className="w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.1 } }}
                exit={{ opacity: 0 }}
              >
                <AuditorView />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Handle to close/open */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full flex justify-center cursor-pointer h-6"
            onClick={handleToggle}
          >
            {/* <motion.div whileHover={{ scale: 1.2 }}>
              <ChevronDown
                className={`w-6 h-6 text-gray-500 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </motion.div> */}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default App;


