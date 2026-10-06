import { HomePage } from './components/HomePage'
import { Toast } from './components/ui'
import { TripPage } from './components/TripPage'
import { useStore } from './state'

export default function App() {
  const { currentTrip, toast } = useStore()
  return (
    <>
      {currentTrip ? <TripPage key={currentTrip.id} trip={currentTrip} /> : <HomePage />}
      {toast && <Toast message={toast.message} />}
    </>
  )
}
