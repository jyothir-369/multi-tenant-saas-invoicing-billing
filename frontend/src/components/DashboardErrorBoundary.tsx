"use client";
import React, { Component, ReactNode } from "react";
interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string; }
export default class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, message: "" }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message || "Something went wrong" }; }
  componentDidCatch(error: Error) { console.error("Dashboard error boundary:", error); }
  handleReload = () => { window.location.reload(); };
  render() { if (this.state.hasError) { return ( <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6"><div className="w-16 h-16 rounded-full bg-red-50 grid place-items-center mb-4"><span className="text-2xl text-red-600">!</span></div><h2 className="text-xl font-extrabold text-[#18221f] mb-2">Something went wrong</h2><p className="text-sm text-[#78817e] mb-6 max-w-md">{this.state.message}</p><button onClick={this.handleReload} className="px-5 py-2.5 rounded-lg bg-[#23745a] text-white font-bold text-sm hover:bg-[#1b6049] transition-colors">Reload</button></div> ); } return this.props.children; }
}
