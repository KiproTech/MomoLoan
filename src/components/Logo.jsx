import logo from '../assets/momo-logo.png'

// The supplied MoMo from MTN logo. It is square (1:1): only the height is set and the width follows,
// so it is never stretched. Pass `height` in pixels (default 40).
export default function Logo({ height = 40 }) {
  return <img className="logo" src={logo} alt="MoMo from MTN" width={height} height={height} style={{ '--logo-h': `${height}px` }} />
}
