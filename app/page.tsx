import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed, ShoppingCart, Clock } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="max-w-2xl text-center space-y-6">
        <div className="flex justify-center animate-fade-in-up">
          <Image
            src="/cropped-logo-venus-1-2.png"
            alt="Venus World Schools"
            width={100}
            height={100}
            className="drop-shadow-md"
          />
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl animate-fade-in-up stagger-1">
          <span className="text-[#1a3a8f]">Venus</span>{" "}
          <span className="text-[#f58220]">Café</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground animate-fade-in-up stagger-2 px-2">
          Pre-order your child&apos;s meals from Venus Café. Browse the menu,
          customize instructions, and skip the queue!
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up stagger-3">
          <Link href="/menu">
            <Button
              size="lg"
              className="gap-2 w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow"
            >
              <ShoppingCart className="h-5 w-5" />
              Browse Menu
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="lg"
              variant="outline"
              className="gap-2 w-full sm:w-auto"
            >
              Get Started
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 sm:pt-12">
          <div className="space-y-2 animate-fade-in-up stagger-4 p-4 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#f58220]/15 p-3">
                <UtensilsCrossed className="h-6 w-6 text-[#f58220]" />
              </div>
            </div>
            <h3 className="font-semibold">Choose Meals</h3>
            <p className="text-sm text-muted-foreground">
              Browse snacks, meals &amp; drinks with custom instructions
            </p>
          </div>
          <div className="space-y-2 animate-fade-in-up stagger-5 p-4 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#1a3a8f]/10 p-3">
                <ShoppingCart className="h-6 w-6 text-[#1a3a8f]" />
              </div>
            </div>
            <h3 className="font-semibold">Place Order</h3>
            <p className="text-sm text-muted-foreground">
              Add to cart, review, and place your order — cash or UPI
            </p>
          </div>
          <div className="space-y-2 animate-fade-in-up stagger-6 p-4 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="flex justify-center">
              <div className="rounded-full bg-[#2eab57]/15 p-3">
                <Clock className="h-6 w-6 text-[#2eab57]" />
              </div>
            </div>
            <h3 className="font-semibold">Track Status</h3>
            <p className="text-sm text-muted-foreground">
              Follow your order from placed → preparing → served
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
